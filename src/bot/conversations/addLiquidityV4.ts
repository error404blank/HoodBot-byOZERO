import type { Conversation } from "@grammyjs/conversations";
import type { MyContext } from "../types";
import { InlineKeyboard } from "grammy";
import { db } from "../../db";
import { users, wallets, lpPositions } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import {
  getV4Pool,
  addLiquidityV4,
  getV4PoolKeyFromAddresses,
  type V4PoolKey,
} from "../../services/uniswapV4";
import { nearestUsableTick, priceToTick } from "../../services/uniswapV3";
import { parseUnits } from "viem";
import { CONTRACTS } from "../../services/chain";
import { getPublicClient } from "../../services/chain";
import { parseAbi } from "viem";
import { decryptPrivateKey, isValidAddress, isValidPin } from "../../services/wallet";
import { feeTierToPercent, shortAddress } from "../../utils/format";

const ERC20_DECIMALS_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

// V4 tick spacing defaults per fee tier
const V4_TICK_SPACINGS: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};

export async function addLiquidityV4Conversation(
  conversation: Conversation<MyContext>,
  ctx: MyContext
) {
  const telegramId = BigInt(ctx.from!.id);

  // ── 1. User & wallet ───────────────────────────────────────────────────────
  const user = await db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
  if (!user) { await ctx.reply("No wallet found. Use /start first."); return; }

  const activeWallet = await db.query.wallets.findFirst({
    where: and(eq(wallets.userId, user.id), eq(wallets.isActive, true)),
  });
  if (!activeWallet) { await ctx.reply("No active wallet. Use /wallet to set one up."); return; }

  await ctx.reply(
    `Uniswap V4 — Add Liquidity\n\nWallet: ${activeWallet.name}\n<code>${activeWallet.address}</code>\n\nV4 PoolManager: <code>${CONTRACTS.UNISWAP_V4_POOL_MANAGER}</code>`,
    { parse_mode: "HTML" }
  );

  // ── 2. Token pair ──────────────────────────────────────────────────────────
  await ctx.reply(
    "Enter token pair addresses (space-separated):\n" +
      "E.g. <code>0xToken0 0xToken1</code>\n\n" +
      "Type <b>default</b> to use WETH/USDG:",
    { parse_mode: "HTML" }
  );

  let token0 = "";
  let token1 = "";
  while (true) {
    const msg = await conversation.waitFor("message:text");
    const input = msg.message.text.trim().toLowerCase();

    if (input === "default") {
      token0 = CONTRACTS.WETH;
      token1 = CONTRACTS.USDG;
      await ctx.reply("Using WETH / USDG pair.");
      break;
    }

    const parts = input.split(/\s+/);
    if (parts.length === 2 && isValidAddress(parts[0]) && isValidAddress(parts[1])) {
      token0 = parts[0];
      token1 = parts[1];
      break;
    }
    await ctx.reply("Invalid. Enter two valid 0x addresses or type 'default':");
  }

  // ── 3. Fee tier & tick spacing ────────────────────────────────────────────
  const feeKeyboard = new InlineKeyboard()
    .text("0.01%", "fee4_100")
    .text("0.05%", "fee4_500")
    .row()
    .text("0.3%", "fee4_3000")
    .text("1%", "fee4_10000");

  await ctx.reply("Select V4 fee tier:", { reply_markup: feeKeyboard });
  const feeAnswer = await conversation.waitFor("callback_query:data");
  await feeAnswer.answerCallbackQuery();
  const feeTier = parseInt(feeAnswer.callbackQuery.data.replace("fee4_", ""));
  const tickSpacing = V4_TICK_SPACINGS[feeTier] ?? 60;

  // ── 4. Build pool key & get pool info ─────────────────────────────────────
  const poolKey: V4PoolKey = getV4PoolKeyFromAddresses(token0, token1, feeTier, tickSpacing);

  await ctx.reply("Checking pool on V4 PoolManager...");
  const poolInfo = await getV4Pool(poolKey);

  if (poolInfo) {
    await ctx.reply(
      `Pool found!\n` +
        `Pool ID: <code>${poolInfo.poolId}</code>\n` +
        `Current Tick: ${poolInfo.currentTick}\n` +
        `Fee: ${feeTierToPercent(feeTier)}\n` +
        `Tick Spacing: ${tickSpacing}`,
      { parse_mode: "HTML" }
    );
  } else {
    await ctx.reply(
      `Pool not initialized yet on V4 PoolManager.\n` +
        `Fee: ${feeTierToPercent(feeTier)} | Tick Spacing: ${tickSpacing}\n\n` +
        `Proceeding with default tick range (full range).`
    );
  }

  const currentTick = poolInfo?.currentTick ?? 0;

  // ── 5. Price range ─────────────────────────────────────────────────────────
  const rangeKeyboard = new InlineKeyboard()
    .text("Full Range", "r4_full")
    .text("±10%", "r4_10")
    .row()
    .text("±20%", "r4_20")
    .text("±50%", "r4_50")
    .row()
    .text("Custom", "r4_custom");

  await ctx.reply("Select price range:", { reply_markup: rangeKeyboard });
  const rangeAnswer = await conversation.waitFor("callback_query:data");
  await rangeAnswer.answerCallbackQuery();
  const rangeChoice = rangeAnswer.callbackQuery.data;

  let tickLower: number;
  let tickUpper: number;

  if (rangeChoice === "r4_full") {
    tickLower = nearestUsableTick(-887272, tickSpacing);
    tickUpper = nearestUsableTick(887272, tickSpacing);
  } else if (rangeChoice === "r4_custom") {
    await ctx.reply("Enter lower price:");
    const lowerMsg = await conversation.waitFor("message:text");
    await ctx.reply("Enter upper price:");
    const upperMsg = await conversation.waitFor("message:text");
    tickLower = nearestUsableTick(priceToTick(parseFloat(lowerMsg.message.text)), tickSpacing);
    tickUpper = nearestUsableTick(priceToTick(parseFloat(upperMsg.message.text)), tickSpacing);
  } else {
    const pct = parseFloat(rangeChoice.replace("r4_", "")) / 100;
    tickLower = nearestUsableTick(Math.floor(currentTick * (1 - pct)), tickSpacing);
    tickUpper = nearestUsableTick(Math.ceil(currentTick * (1 + pct)), tickSpacing);
  }

  await ctx.reply(`Range: [${tickLower}, ${tickUpper}]`);

  // ── 6. Amount input ────────────────────────────────────────────────────────
  const publicClient = getPublicClient();
  let dec0 = 18, dec1 = 18;
  try {
    [dec0, dec1] = await Promise.all([
      publicClient.readContract({ address: poolKey.currency0 as `0x${string}`, abi: ERC20_DECIMALS_ABI, functionName: "decimals" }),
      publicClient.readContract({ address: poolKey.currency1 as `0x${string}`, abi: ERC20_DECIMALS_ABI, functionName: "decimals" }),
    ]);
  } catch {}

  await ctx.reply(`Enter max amount for token0 (${shortAddress(poolKey.currency0)}, ${dec0} decimals):`);
  const amount0Msg = await conversation.waitFor("message:text");
  const amount0Human = amount0Msg.message.text.trim();

  await ctx.reply(`Enter max amount for token1 (${shortAddress(poolKey.currency1)}, ${dec1} decimals):`);
  const amount1Msg = await conversation.waitFor("message:text");
  const amount1Human = amount1Msg.message.text.trim();

  const amount0Max = parseUnits(amount0Human, dec0);
  const amount1Max = parseUnits(amount1Human, dec1);

  // ── 7. Liquidity (use tick range delta as rough approximation) ─────────────
  const liquidityApprox = amount0Max > amount1Max ? amount0Max : amount1Max;

  // ── 8. Confirm + PIN ───────────────────────────────────────────────────────
  const confirmKeyboard = new InlineKeyboard().text("Confirm", "confirm4").text("Cancel", "cancel4");
  await ctx.reply(
    `V4 LP Summary:\n\n` +
      `Wallet: ${activeWallet.name}\n` +
      `Token0: ${shortAddress(poolKey.currency0)} — ${amount0Human}\n` +
      `Token1: ${shortAddress(poolKey.currency1)} — ${amount1Human}\n` +
      `Fee: ${feeTierToPercent(feeTier)} | Tick Spacing: ${tickSpacing}\n` +
      `Range: [${tickLower}, ${tickUpper}]\n\n` +
      `Confirm and enter PIN:`,
    { reply_markup: confirmKeyboard }
  );

  const confirmAnswer = await conversation.waitFor("callback_query:data");
  await confirmAnswer.answerCallbackQuery();
  if (confirmAnswer.callbackQuery.data === "cancel4") {
    await ctx.reply("Cancelled.");
    return;
  }

  await ctx.reply("Enter your 6-digit PIN:");
  const pinMsg = await conversation.waitFor("message:text");
  const pin = pinMsg.message.text.trim();
  try { await pinMsg.deleteMessage(); } catch {}

  if (!isValidPin(pin)) { await ctx.reply("Invalid PIN. Cancelled."); return; }

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
    await ctx.reply("Incorrect PIN. Cancelled.");
    return;
  }

  // ── 9. Execute ─────────────────────────────────────────────────────────────
  await ctx.reply("Submitting V4 liquidity transaction...");

  try {
    const result = await addLiquidityV4({
      poolKey,
      tickLower,
      tickUpper,
      liquidity: liquidityApprox,
      amount0Max,
      amount1Max,
      privateKey: privateKey as `0x${string}`,
      recipientAddress: activeWallet.address,
    });

    await db.insert(lpPositions).values({
      userId: user.id,
      walletId: activeWallet.id,
      version: "v4",
      tokenId: result.tokenId,
      poolAddress: CONTRACTS.UNISWAP_V4_POOL_MANAGER,
      token0: poolKey.currency0,
      token1: poolKey.currency1,
      feeTier,
      tickLower,
      tickUpper,
      autoRebalance: false,
    });

    await ctx.reply(
      `V4 Liquidity Added!\n\n` +
        `Position NFT ID: ${result.tokenId}\n` +
        `TX: <code>${result.txHash}</code>\n` +
        `View: https://robinhoodchain.blockscout.com/tx/${result.txHash}\n\n` +
        `Use /positions to manage.`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    await ctx.reply(`Transaction failed:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
