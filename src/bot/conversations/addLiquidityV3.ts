import type { Conversation } from "@grammyjs/conversations";
import type { MyContext } from "../types";
import { InlineKeyboard } from "grammy";
import { db } from "../../db";
import { users, wallets, lpPositions } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { getV3Pool, addLiquidityV3, nearestUsableTick, priceToTick, FEE_TIERS, type FeeTier } from "../../services/uniswapV3";
import { getTopPools, formatUsd } from "../../services/data/geckoTerminal";
import { getTokenSafety } from "../../services/data/gmgn";
import { decryptPrivateKey, isValidAddress, isValidPin } from "../../services/wallet";
import { feeTierToPercent, shortAddress } from "../../utils/format";
import { CONTRACTS } from "../../services/chain";
import { waitOrCancel, CancelledError } from "./cancelHelper";

export async function addLiquidityV3Conversation(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  const telegramId = BigInt(ctx.from!.id);

  // ── 1. Find user and active wallet ────────────────────────────────────────
  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });

  if (!user) {
    await ctx.reply("No wallet found. Use /start to create one first.");
    return;
  }

  const activeWallet = await db.query.wallets.findFirst({
    where: and(eq(wallets.userId, user.id), eq(wallets.isActive, true)),
  });

  if (!activeWallet) {
    await ctx.reply("No active wallet. Use /wallet to set one up.");
    return;
  }

  await ctx.reply(`Using wallet: ${activeWallet.name}\nAddress: <code>${activeWallet.address}</code>`, {
    parse_mode: "HTML",
  });

  try {
  // ── 2. Token selection ────────────────────────────────────────────────────
  await ctx.reply(
    "Add Liquidity — Uniswap V3\n\n" +
      "Enter the token pair (e.g. <code>0xToken0 0xToken1</code>)\n" +
      "Or type <b>top</b> to see top pools on Robinhood Chain.\n\n" +
      "Send /cancel at any time to abort.",
    { parse_mode: "HTML" }
  );

  let token0 = "";
  let token1 = "";

  while (true) {
    const pairMsg = await waitOrCancel(conversation, ctx);
    const input = pairMsg.message.text.trim().toLowerCase();

    if (input === "top") {
      await ctx.reply("Fetching top pools...");
      const pools = await getTopPools(8);

      if (pools.length === 0) {
        await ctx.reply("Could not fetch pools from GeckoTerminal. Enter token addresses manually:");
        continue;
      }

      const keyboard = new InlineKeyboard();
      pools.forEach((pool, i) => {
        keyboard.text(
          `${pool.baseTokenSymbol}/${pool.quoteTokenSymbol} TVL:${formatUsd(pool.tvlUsd)}`,
          `pool_${i}`
        );
        if (i % 2 === 1) keyboard.row();
      });

      const poolListText = pools
        .map(
          (p, i) =>
            `${i + 1}. ${p.name}\n   Price: ${p.priceUsd !== "0" ? "$" + parseFloat(p.priceUsd).toFixed(6) : "N/A"}\n   TVL: ${formatUsd(p.tvlUsd)} | Vol 24h: ${formatUsd(p.volumeUsd24h)}`
        )
        .join("\n\n");

      await ctx.reply(`Top Pools on Robinhood Chain:\n\n${poolListText}\n\nEnter pool number or paste token addresses:`, {
        reply_markup: keyboard,
      });

      const selMsg = await waitOrCancel(conversation, ctx);
      const sel = parseInt(selMsg.message.text.trim()) - 1;
      if (sel >= 0 && sel < pools.length) {
        const selected = pools[sel];
        token0 = selected.baseTokenAddress || CONTRACTS.WETH;
        token1 = selected.quoteTokenAddress || CONTRACTS.USDG;
        await ctx.reply(`Selected: ${selected.name}`);
        break;
      }
      await ctx.reply("Invalid selection. Enter token pair addresses (space-separated):");
      continue;
    }

    const parts = input.split(/\s+/);
    if (parts.length === 2 && isValidAddress(parts[0]) && isValidAddress(parts[1])) {
      token0 = parts[0];
      token1 = parts[1];
      break;
    }

    await ctx.reply("Invalid input. Paste two addresses separated by space, or type 'top':");
  }

  // ── 3. Token safety check ─────────────────────────────────────────────────
  const safety = await getTokenSafety(token0);
  if (safety && (safety.riskLevel === "critical" || safety.riskLevel === "high")) {
    const keyboard = new InlineKeyboard()
      .text("Proceed anyway", "proceed")
      .text("Cancel", "cancel");

    await ctx.reply(
      `Warning: ${safety.riskLevel.toUpperCase()} risk token detected\n` +
        `Risk Score: ${safety.riskScore}/100\n` +
        `Honeypot: ${safety.isHoneypot ? "YES" : "No"}\n\n` +
        `Do you want to continue?`,
      { reply_markup: keyboard }
    );

    const answer = await conversation.waitFor("callback_query:data");
    await answer.answerCallbackQuery();
    if (answer.callbackQuery.data === "cancel") {
      await ctx.reply("Cancelled.");
      return;
    }
  }

  // ── 4. Fee tier selection ─────────────────────────────────────────────────
  const feeKeyboard = new InlineKeyboard()
    .text("0.01% (Stable)", "fee_100")
    .text("0.05% (Low)", "fee_500")
    .row()
    .text("0.3% (Standard)", "fee_3000")
    .text("1% (Exotic)", "fee_10000");

  await ctx.reply("Select fee tier:", { reply_markup: feeKeyboard });

  const feeAnswer = await conversation.waitFor("callback_query:data");
  await feeAnswer.answerCallbackQuery();
  const feeTier = parseInt(feeAnswer.callbackQuery.data.replace("fee_", "")) as FeeTier;

  // ── 5. Fetch pool info ────────────────────────────────────────────────────
  await ctx.reply("Fetching pool data...");
  const pool = await getV3Pool(token0, token1, feeTier);

  if (!pool) {
    await ctx.reply(
      `No pool found for this pair with ${feeTierToPercent(feeTier)} fee.\n` +
        `The pool may not exist yet on Robinhood Chain.\n\nTry a different fee tier.`
    );
    return;
  }

  const currentPrice = pool.currentPrice.toFixed(8);
  await ctx.reply(
    `Pool found!\n` +
      `Address: <code>${pool.address}</code>\n` +
      `Current Price: ${currentPrice}\n` +
      `Current Tick: ${pool.currentTick}\n` +
      `Fee: ${feeTierToPercent(feeTier)}\n` +
      `Tick Spacing: ${pool.tickSpacing}`,
    { parse_mode: "HTML" }
  );

  // ── 6. Price range ────────────────────────────────────────────────────────
  const rangeKeyboard = new InlineKeyboard()
    .text("Full Range", "range_full")
    .text("±10%", "range_10")
    .row()
    .text("±20%", "range_20")
    .text("±50%", "range_50")
    .row()
    .text("Custom", "range_custom");

  await ctx.reply("Select price range:", { reply_markup: rangeKeyboard });

  const rangeAnswer = await conversation.waitFor("callback_query:data");
  await rangeAnswer.answerCallbackQuery();
  const rangeChoice = rangeAnswer.callbackQuery.data;

  let tickLower: number;
  let tickUpper: number;

  if (rangeChoice === "range_full") {
    tickLower = nearestUsableTick(-887272, pool.tickSpacing);
    tickUpper = nearestUsableTick(887272, pool.tickSpacing);
  } else if (rangeChoice === "range_custom") {
    await ctx.reply("Enter lower price:");
    const lowerMsg = await waitOrCancel(conversation, ctx);
    const lowerPrice = parseFloat(lowerMsg.message.text);

    await ctx.reply("Enter upper price:");
    const upperMsg = await waitOrCancel(conversation, ctx);
    const upperPrice = parseFloat(upperMsg.message.text);

    tickLower = nearestUsableTick(priceToTick(lowerPrice), pool.tickSpacing);
    tickUpper = nearestUsableTick(priceToTick(upperPrice), pool.tickSpacing);
  } else {
    const pct = parseFloat(rangeChoice.replace("range_", "")) / 100;
    tickLower = nearestUsableTick(
      Math.floor(pool.currentTick * (1 - pct)),
      pool.tickSpacing
    );
    tickUpper = nearestUsableTick(
      Math.ceil(pool.currentTick * (1 + pct)),
      pool.tickSpacing
    );
  }

  await ctx.reply(
    `Price range set:\nTick Lower: ${tickLower}\nTick Upper: ${tickUpper}`
  );

  // ── 7. Amounts ────────────────────────────────────────────────────────────
  await ctx.reply(`Enter amount of token0 (${shortAddress(token0)}):`);
  const amount0Msg = await waitOrCancel(conversation, ctx);
  const amount0 = amount0Msg.message.text.trim();

  await ctx.reply(`Enter amount of token1 (${shortAddress(token1)}):`);
  const amount1Msg = await waitOrCancel(conversation, ctx);
  const amount1 = amount1Msg.message.text.trim();

  // ── 8. Slippage ───────────────────────────────────────────────────────────
  const slippageKeyboard = new InlineKeyboard()
    .text("0.1%", "slip_10")
    .text("0.5%", "slip_50")
    .text("1%", "slip_100")
    .text("Custom", "slip_custom");

  await ctx.reply("Select slippage tolerance:", { reply_markup: slippageKeyboard });
  const slippageAnswer = await conversation.waitFor("callback_query:data");
  await slippageAnswer.answerCallbackQuery();

  let slippageBps = 50;
  if (slippageAnswer.callbackQuery.data === "slip_custom") {
    await ctx.reply("Enter slippage % (e.g. 0.5):");
    const slipMsg = await waitOrCancel(conversation, ctx);
    slippageBps = Math.round(parseFloat(slipMsg.message.text) * 100);
  } else {
    slippageBps = parseInt(slippageAnswer.callbackQuery.data.replace("slip_", ""));
  }

  // ── 9. Confirm ────────────────────────────────────────────────────────────
  const confirmKeyboard = new InlineKeyboard().text("Confirm", "confirm").text("Cancel", "cancel");
  await ctx.reply(
    `Summary:\n\n` +
      `Wallet: ${activeWallet.name}\n` +
      `Pool: ${shortAddress(token0)} / ${shortAddress(token1)}\n` +
      `Fee Tier: ${feeTierToPercent(feeTier)}\n` +
      `Amount0: ${amount0}\n` +
      `Amount1: ${amount1}\n` +
      `Tick Range: [${tickLower}, ${tickUpper}]\n` +
      `Slippage: ${slippageBps / 100}%\n\n` +
      `Enter your PIN to proceed:`,
    { reply_markup: confirmKeyboard }
  );

  const confirmAnswer = await conversation.waitFor("callback_query:data");
  await confirmAnswer.answerCallbackQuery();
  if (confirmAnswer.callbackQuery.data === "cancel") {
    await ctx.reply("Cancelled.");
    return;
  }

  // ── 10. PIN ───────────────────────────────────────────────────────────────
  await ctx.reply("Enter your 6-digit PIN:");
  const pinMsg = await waitOrCancel(conversation, ctx);
  const pin = pinMsg.message.text.trim();
  try { await pinMsg.deleteMessage(); } catch {}

  if (!isValidPin(pin)) {
    await ctx.reply("Invalid PIN. Operation cancelled.");
    return;
  }

  // ── 11. Decrypt and execute ───────────────────────────────────────────────
  let privateKey: string;
  try {
    privateKey = await decryptPrivateKey(
      activeWallet.encryptedPrivateKey,
      activeWallet.encryptedIv,
      activeWallet.salt,
      pin,
      telegramId.toString()
    );
  } catch {
    await ctx.reply("Incorrect PIN. Operation cancelled.");
    return;
  }

  await ctx.reply("Submitting transaction...");

  try {
    const result = await addLiquidityV3({
      token0,
      token1,
      fee: feeTier,
      amount0,
      amount1,
      tickLower,
      tickUpper,
      slippageBps,
      privateKey: privateKey as `0x${string}`,
      recipientAddress: activeWallet.address,
    });

    // Save position to DB
    await db.insert(lpPositions).values({
      userId: user.id,
      walletId: activeWallet.id,
      version: "v3",
      tokenId: result.tokenId,
      poolAddress: pool.address,
      token0,
      token1,
      feeTier,
      tickLower,
      tickUpper,
      autoRebalance: false,
    });

    await ctx.reply(
      `Liquidity added!\n\n` +
        `Position NFT ID: ${result.tokenId}\n` +
        `TX: <code>${result.txHash}</code>\n` +
        `View: https://robinhoodchain.blockscout.com/tx/${result.txHash}\n\n` +
        `Use /positions to manage this position.`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    await ctx.reply(
      `Transaction failed:\n${err instanceof Error ? err.message : String(err)}`
    );
  }
  } catch (err) {
    if (!(err instanceof CancelledError)) throw err;
  }
}
