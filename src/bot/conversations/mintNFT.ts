import type { Conversation } from "@grammyjs/conversations";
import type { MyContext } from "../types";
import { InlineKeyboard } from "grammy";
import { db } from "../../db";
import { users, wallets, nftMints, autoMintWatchers } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import {
  detectNftContract,
  mintNft,
  simulateMint,
  checkAllowlist,
  formatContractInfo,
  classifyMintError,
} from "../../services/nft";
import { decryptPrivateKey, isValidAddress, isValidPin } from "../../services/wallet";
import { waitOrCancel, CancelledError } from "./cancelHelper";
import { SUPPORTED_MINT_CHAINS, type MintChainSlug } from "../../services/chain";

export async function mintNFTConversation(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  const telegramId = BigInt(ctx.from!.id);

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
    await ctx.reply("No active wallet. Use /wallet to create or switch one.");
    return;
  }

  try {
    // ── 0. Network selection ────────────────────────────────────────────────
    const networkKb = new InlineKeyboard();
    SUPPORTED_MINT_CHAINS.forEach((c) => {
      networkKb.text(c.name, `chain_${c.slug}`).row();
    });
    await ctx.reply("NFT Minting — Pilih Network:", { reply_markup: networkKb });
    const networkAnswer = await conversation.waitFor("callback_query:data");
    await networkAnswer.answerCallbackQuery();
    const chainSlug = networkAnswer.callbackQuery.data.replace("chain_", "") as MintChainSlug;
    const selectedChain = SUPPORTED_MINT_CHAINS.find((c) => c.slug === chainSlug) ?? SUPPORTED_MINT_CHAINS[1];

    // ── 1. Contract address ─────────────────────────────────────────────────
    await ctx.reply(
      `NFT Minting — ${selectedChain.name}\n\n` +
        "Paste the NFT contract address to mint from.\n\n" +
        "Send /cancel at any time to abort."
    );

    let contractAddress = "";
    while (true) {
      const addrMsg = await waitOrCancel(conversation, ctx);
      const input = addrMsg.message.text.trim();
      if (!isValidAddress(input)) {
        await ctx.reply("Invalid address. Paste a valid 0x... contract address:");
        continue;
      }
      contractAddress = input;
      break;
    }

    // ── 2. Detect contract ──────────────────────────────────────────────────
    await ctx.reply("Detecting contract...");
    const contractInfo = await detectNftContract(contractAddress, chainSlug);

    if (!contractInfo.hasCode) {
      await ctx.reply(`No contract found at this address on ${selectedChain.name}.`);
      return;
    }

    await ctx.reply(formatContractInfo(contractInfo), { parse_mode: "HTML" });

    if (contractInfo.standard === "UNKNOWN") {
      const keyboard = new InlineKeyboard()
        .text("Try anyway", "proceed")
        .text("Cancel", "cancel");
      await ctx.reply(
        "Could not detect ERC-721/1155 interface. Proceed anyway?",
        { reply_markup: keyboard }
      );
      const answer = await conversation.waitFor("callback_query:data");
      await answer.answerCallbackQuery();
      if (answer.callbackQuery.data === "cancel") {
        await ctx.reply("Cancelled.");
        return;
      }
    }

    // Warn if phase is paused or sold out
    if (contractInfo.phase === "paused") {
      const warnKb = new InlineKeyboard()
        .text("Continue anyway", "continue")
        .text("Set up Sniper", "sniper")
        .text("Cancel", "cancel");
      await ctx.reply(
        "Contract appears to be PAUSED. You can:\n" +
          "- Continue anyway (transaction may fail)\n" +
          "- Set up Sniper to auto-mint when it goes live\n" +
          "- Cancel",
        { reply_markup: warnKb }
      );
      const pausedAnswer = await conversation.waitFor("callback_query:data");
      await pausedAnswer.answerCallbackQuery();
      if (pausedAnswer.callbackQuery.data === "cancel") {
        await ctx.reply("Cancelled.");
        return;
      }
      if (pausedAnswer.callbackQuery.data === "sniper") {
        // Jump straight to sniper setup
        await setupSniperWatcher({ ctx, conversation, user, activeWallet, contractAddress, contractInfo, quantity: 1, mintPriceOverride: null });
        return;
      }
    }

    if (contractInfo.phase === "soldout") {
      await ctx.reply("This collection is sold out. Mint cancelled.");
      return;
    }

    // ── 3. WL check ─────────────────────────────────────────────────────────
    if (contractInfo.phase === "allowlist" || contractInfo.phase === "unknown") {
      await ctx.reply("Checking allowlist eligibility...");
      const eligible = await checkAllowlist(contractAddress, activeWallet.address);
      if (eligible === false) {
        const wlKb = new InlineKeyboard()
          .text("Try anyway", "proceed")
          .text("Cancel", "cancel");
        await ctx.reply(
          "Wallet is NOT on the allowlist for this contract.\n" +
            "Active wallet: " + activeWallet.address,
          { reply_markup: wlKb }
        );
        const wlAnswer = await conversation.waitFor("callback_query:data");
        await wlAnswer.answerCallbackQuery();
        if (wlAnswer.callbackQuery.data === "cancel") {
          await ctx.reply("Cancelled.");
          return;
        }
      } else if (eligible === true) {
        await ctx.reply("Wallet is on the allowlist.");
      }
      // null means contract has no allowlist check — continue silently
    }

    // ── 4. Quantity ─────────────────────────────────────────────────────────
    await ctx.reply("How many to mint? (1-20):");
    let quantity = 1;
    while (true) {
      const qtyMsg = await waitOrCancel(conversation, ctx);
      const n = parseInt(qtyMsg.message.text.trim());
      if (isNaN(n) || n < 1 || n > 20) {
        await ctx.reply("Enter a number between 1 and 20:");
        continue;
      }
      quantity = n;
      break;
    }

    // ── 5. Custom price override ────────────────────────────────────────────
    let mintPriceWei = contractInfo.mintPriceWei;
    if (contractInfo.mintPriceWei === 0n) {
      const priceKb = new InlineKeyboard()
        .text("Free (0 ETH)", "price_free")
        .text("Enter price manually", "price_manual");
      await ctx.reply(
        "Detected price: Free\nUse free or enter a price manually?",
        { reply_markup: priceKb }
      );
      const priceAnswer = await conversation.waitFor("callback_query:data");
      await priceAnswer.answerCallbackQuery();
      if (priceAnswer.callbackQuery.data === "price_manual") {
        await ctx.reply("Enter price per NFT in ETH (e.g. 0.05):");
        while (true) {
          const priceMsg = await waitOrCancel(conversation, ctx);
          const p = parseFloat(priceMsg.message.text.trim());
          if (isNaN(p) || p < 0) {
            await ctx.reply("Enter a valid ETH amount:");
            continue;
          }
          mintPriceWei = BigInt(Math.round(p * 1e18));
          break;
        }
      }
    }

    // ── 6. Mode: Mint now / Auto-watch / Sniper ──────────────────────────────
    const modeKb = new InlineKeyboard()
      .text("Mint now", "mint_now")
      .row()
      .text("Dry-run (simulate)", "dry_run")
      .row()
      .text("Sniper (auto-mint when live)", "sniper")
      .row()
      .text("Auto-watch & mint", "auto_mint");

    await ctx.reply(
      "Choose action:",
      { reply_markup: modeKb }
    );

    const modeAnswer = await conversation.waitFor("callback_query:data");
    await modeAnswer.answerCallbackQuery();
    const mode = modeAnswer.callbackQuery.data;

    // ── 6a. Auto-watch ──────────────��────────────────────────────────────────
    if (mode === "auto_mint") {
      await db.insert(autoMintWatchers).values({
        userId: user.id,
        walletId: activeWallet.id,
        contractAddress,
        quantity,
        isActive: true,
      });
      await ctx.reply(
        "Auto-mint watcher created.\n\n" +
          `Contract: <code>${contractAddress}</code>\n` +
          `Quantity: ${quantity}\n\n` +
          "The bot will mint automatically when the contract is live. " +
          "You will be prompted for your PIN when it triggers.",
        { parse_mode: "HTML" }
      );
      return;
    }

    // ── 6b. Sniper ───────────────────────────────────────────────────────────
    if (mode === "sniper") {
      await setupSniperWatcher({ ctx, conversation, user, activeWallet, contractAddress, contractInfo, quantity, mintPriceOverride: mintPriceWei });
      return;
    }

    // ── 6c. Dry-run (simulate) ───────────────────────────────────────────────
    if (mode === "dry_run") {
      await ctx.reply("Simulating transaction...");
      const sim = await simulateMint(contractAddress, quantity, mintPriceWei, activeWallet.address, chainSlug);
      if (sim.success) {
        await ctx.reply(
          `Simulation passed.\n\n` +
            `Gas estimate: ${Number(sim.gasEstimate).toLocaleString()} units\n\n` +
            "Transaction is likely to succeed. Use Mint now to execute."
        );
      } else {
        await ctx.reply(
          `Simulation failed (${sim.errorType}):\n${sim.errorMessage}\n\n` +
            (sim.errorType === "fatal"
              ? "This is a fatal error — do not proceed."
              : "This may be retryable (phase not open yet, etc.)")
        );
      }
      return;
    }

    // ── 7. Confirm summary + PIN (mint_now) ──────────────────────────────────
    const totalEth = (Number(mintPriceWei) * quantity) / 1e18;
    const confirmKb = new InlineKeyboard()
      .text("Confirm & Mint", "confirm")
      .text("Cancel", "cancel");

    await ctx.reply(
      `Mint Summary\n\n` +
        `Collection: <b>${contractInfo.name}</b> (${contractInfo.symbol})\n` +
        `Contract: <code>${contractAddress}</code>\n` +
        `Quantity: ${quantity}\n` +
        `Price/NFT: ${(Number(mintPriceWei) / 1e18).toFixed(6)} ETH\n` +
        `Total: ${totalEth.toFixed(6)} ETH\n` +
        `Wallet: ${activeWallet.name} (${activeWallet.address.slice(0, 8)}...)`,
      { reply_markup: confirmKb, parse_mode: "HTML" }
    );

    const confirmAnswer = await conversation.waitFor("callback_query:data");
    await confirmAnswer.answerCallbackQuery();
    if (confirmAnswer.callbackQuery.data === "cancel") {
      await ctx.reply("Cancelled.");
      return;
    }

    await ctx.reply("Enter your 6-digit PIN:");
    const pinMsg = await waitOrCancel(conversation, ctx);
    const pin = pinMsg.message.text.trim();
    try { await pinMsg.deleteMessage(); } catch {}

    if (!isValidPin(pin)) {
      await ctx.reply("Invalid PIN. Cancelled.");
      return;
    }

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

    // ── 8. Execute mint ──────────────────────────────────────────────────────
    await ctx.reply("Submitting mint transaction...");

    try {
      const result = await mintNft({
        contractAddress,
        quantity,
        mintPriceWei,
        privateKey: privateKey as `0x${string}`,
        recipientAddress: activeWallet.address,
        chainSlug,
      });

      await db.insert(nftMints).values({
        userId: user.id,
        walletId: activeWallet.id,
        contractAddress,
        quantity,
        txHash: result.txHash,
      });

      await ctx.reply(
        `Minted successfully!\n\n` +
          `Collection: ${contractInfo.name}\n` +
          `Quantity: ${quantity}\n` +
          `Gas used: ${result.gasUsed ? Number(result.gasUsed).toLocaleString() : "N/A"}\n` +
          `TX: <code>${result.txHash}</code>\n` +
          `Explorer: ${selectedChain.explorer}/tx/${result.txHash}`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errType = classifyMintError(msg);
      await ctx.reply(
        `Mint failed (${errType}):\n${msg}`
      );
    }
  } catch (err) {
    if (!(err instanceof CancelledError)) throw err;
  }
}

// ─── Sniper watcher setup helper ─────────────────────────────────────────────
async function setupSniperWatcher({
  ctx,
  conversation,
  user,
  activeWallet,
  contractAddress,
  contractInfo,
  quantity,
  mintPriceOverride,
}: {
  ctx: MyContext;
  conversation: Conversation<MyContext, MyContext>;
  user: { id: number };
  activeWallet: { id: number; name: string };
  contractAddress: string;
  contractInfo: { name: string };
  quantity: number;
  mintPriceOverride: bigint | null;
}) {
  await ctx.reply(
    "Sniper Mode\n\n" +
      "The bot will poll this contract every 30 seconds and mint immediately when " +
      "the sale goes live.\n\n" +
      "Max price per NFT in ETH (e.g. 0.05), or 0 for any price:"
  );

  let maxPriceEth = "0";
  while (true) {
    const priceMsg = await waitOrCancel(conversation, ctx);
    const p = parseFloat(priceMsg.message.text.trim());
    if (isNaN(p) || p < 0) {
      await ctx.reply("Enter a valid ETH amount (0 = no limit):");
      continue;
    }
    maxPriceEth = p.toFixed(8);
    break;
  }

  await db.insert(autoMintWatchers).values({
    userId: user.id,
    walletId: activeWallet.id,
    contractAddress,
    quantity,
    maxPriceEth,
    isActive: true,
  });

  await ctx.reply(
    `Sniper set up.\n\n` +
      `Contract: <code>${contractAddress}</code>\n` +
      `Collection: ${contractInfo.name}\n` +
      `Quantity: ${quantity}\n` +
      `Max price: ${maxPriceEth === "0.00000000" ? "No limit" : maxPriceEth + " ETH"}\n\n` +
      "The bot will mint automatically when the contract goes live. " +
      "You will be asked for PIN when it triggers.\n\n" +
      "Use /start to manage watchers.",
    { parse_mode: "HTML" }
  );
}
