import type { Conversation } from "@grammyjs/conversations";
import type { MyContext } from "../types";
import { InlineKeyboard } from "grammy";
import { db } from "../../db";
import { users, wallets, nftMints, autoMintWatchers } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { detectNftContract, mintNft, formatContractInfo } from "../../services/nft";
import { decryptPrivateKey, isValidAddress, isValidPin } from "../../services/wallet";
import { waitOrCancel, CancelledError } from "./cancelHelper";

export async function mintNFTConversation(
  conversation: Conversation<MyContext>,
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
    await ctx.reply("No active wallet. Use /wallet to create one.");
    return;
  }

  try {
  // ── 1. Contract address ───────────────────────────────────────────────────
  await ctx.reply(
    "NFT Minting\n\n" +
      "Paste the NFT contract address to mint from.\n\n" +
      "Send /cancel at any time to abort."
  );

  let contractAddress = "";
  while (true) {
    const addrMsg = await waitOrCancel(conversation, ctx);
    const input = addrMsg.message.text.trim();
    if (!isValidAddress(input)) {
      await ctx.reply("Invalid address. Please paste a valid 0x... address:");
      continue;
    }
    contractAddress = input;
    break;
  }

  // ── 2. Detect contract ────────────────────────────────────────────────────
  await ctx.reply("Detecting contract...");
  const contractInfo = await detectNftContract(contractAddress);

  if (!contractInfo.hasCode) {
    await ctx.reply("No contract found at this address on Robinhood Chain.");
    return;
  }

  await ctx.reply(
    formatContractInfo(contractInfo),
    { parse_mode: "HTML" }
  );

  if (contractInfo.standard === "UNKNOWN") {
    const keyboard = new InlineKeyboard()
      .text("Try anyway", "proceed")
      .text("Cancel", "cancel");
    await ctx.reply(
      "Could not detect ERC-721/1155 interface. The contract may use a non-standard ABI.\nProceed anyway?",
      { reply_markup: keyboard }
    );
    const answer = await conversation.waitFor("callback_query:data");
    await answer.answerCallbackQuery();
    if (answer.callbackQuery.data === "cancel") {
      await ctx.reply("Cancelled.");
      return;
    }
  }

  // ── 3. Quantity ───────────────────────────────────────────────────────────
  await ctx.reply("How many to mint? (enter a number, max 20):");
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

  // ── 4. Auto-mint toggle ───────────────────────────────────────────────────
  const autoKeyboard = new InlineKeyboard()
    .text("Mint now", "mint_now")
    .text("Auto-watch & mint", "auto_mint");

  await ctx.reply(
    "Mint now or set up auto-mint watcher?",
    { reply_markup: autoKeyboard }
  );

  const modeAnswer = await conversation.waitFor("callback_query:data");
  await modeAnswer.answerCallbackQuery();

  if (modeAnswer.callbackQuery.data === "auto_mint") {
    // Save auto-mint watcher
    await db.insert(autoMintWatchers).values({
      userId: user.id,
      walletId: activeWallet.id,
      contractAddress,
      quantity,
      isActive: true,
    });

    await ctx.reply(
      `Auto-mint watcher created!\n\n` +
        `Contract: <code>${contractAddress}</code>\n` +
        `Quantity: ${quantity}\n` +
        `The bot will mint automatically when the contract is live.\n\n` +
        `Note: You will be prompted for PIN when the mint triggers.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // ── 5. Confirm + PIN ──────────────────────────────────────────────────────
  const totalCost = parseFloat(contractInfo.mintPrice) * quantity;
  const confirmKeyboard = new InlineKeyboard()
    .text("Confirm", "confirm")
    .text("Cancel", "cancel");

  await ctx.reply(
    `Mint Summary:\n\n` +
      `Collection: ${contractInfo.name}\n` +
      `Contract: <code>${contractAddress}</code>\n` +
      `Quantity: ${quantity}\n` +
      `Price per NFT: ${contractInfo.mintPrice} ETH\n` +
      `Total: ${totalCost.toFixed(6)} ETH\n` +
      `Wallet: ${activeWallet.name}`,
    { reply_markup: confirmKeyboard, parse_mode: "HTML" }
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

  // ── 6. Execute mint ───────────────────────────────────────────────────────
  await ctx.reply("Submitting mint transaction...");

  try {
    const result = await mintNft({
      contractAddress,
      quantity,
      mintPrice: contractInfo.mintPrice,
      privateKey: privateKey as `0x${string}`,
      recipientAddress: activeWallet.address,
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
        `TX: <code>${result.txHash}</code>\n` +
        `View: https://robinhoodchain.blockscout.com/tx/${result.txHash}`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    await ctx.reply(
      `Mint failed:\n${err instanceof Error ? err.message : String(err)}`
    );
  }
  } catch (err) {
    if (!(err instanceof CancelledError)) throw err;
  }
}
