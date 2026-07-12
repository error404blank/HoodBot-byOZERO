import type { Conversation } from "@grammyjs/conversations";
import type { MyContext } from "../types";
import { db } from "../../db";
import { users, wallets } from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  walletFromPrivateKey,
  walletFromMnemonic,
  encryptPrivateKey,
  isValidPin,
  isValidPrivateKey,
  hashPin,
} from "../../services/wallet";
import { waitOrCancel, CancelledError } from "./cancelHelper";

export async function importWalletConversation(
  conversation: Conversation<MyContext>,
  ctx: MyContext
) {
  const telegramId = BigInt(ctx.from!.id);

  await ctx.reply(
    "Import a wallet\n\n" +
      "Paste your private key (0x...) or 12/24-word seed phrase.\n" +
      "This message will be deleted immediately for security.\n\n" +
      "Send /cancel at any time to abort."
  );

  let importedAddress = "";
  let importedPrivateKey = "";

  try {
  while (true) {
    const keyMsg = await waitOrCancel(conversation, ctx);
    const input = keyMsg.message.text.trim();

    // Delete immediately
    try {
      await keyMsg.deleteMessage();
    } catch {}

    const wordCount = input.split(/\s+/).length;

    if (isValidPrivateKey(input)) {
      try {
        const result = walletFromPrivateKey(input);
        importedAddress = result.address;
        importedPrivateKey = result.privateKey;
        break;
      } catch {
        await ctx.reply("Invalid private key. Try again:");
        continue;
      }
    } else if (wordCount === 12 || wordCount === 24) {
      try {
        const result = walletFromMnemonic(input);
        importedAddress = result.address;
        importedPrivateKey = result.privateKey;
        break;
      } catch {
        await ctx.reply("Invalid seed phrase. Try again:");
        continue;
      }
    } else {
      await ctx.reply(
        "Not recognized. Please send a private key (0x...) or 12/24-word seed phrase:"
      );
      continue;
    }
  }

  await ctx.reply(`Address detected: <code>${importedAddress}</code>\n\nSet a 6-digit PIN to encrypt this wallet:`, {
    parse_mode: "HTML",
  });

  let pin = "";
  while (true) {
    const pinMsg = await waitOrCancel(conversation, ctx);
    pin = pinMsg.message.text.trim();
    try { await pinMsg.deleteMessage(); } catch {}

    if (!isValidPin(pin)) {
      await ctx.reply("PIN must be exactly 6 digits. Try again:");
      continue;
    }
    break;
  }

  await ctx.reply("Confirm PIN:");
  while (true) {
    const confirmMsg = await waitOrCancel(conversation, ctx);
    const confirm = confirmMsg.message.text.trim();
    try { await confirmMsg.deleteMessage(); } catch {}

    if (confirm !== pin) {
      await ctx.reply("PINs do not match. Re-enter PIN:");
      while (true) {
        const retryMsg = await waitOrCancel(conversation, ctx);
        pin = retryMsg.message.text.trim();
        try { await retryMsg.deleteMessage(); } catch {}
        if (!isValidPin(pin)) { await ctx.reply("6 digits required:"); continue; }
        break;
      }
      await ctx.reply("Confirm PIN:");
      continue;
    }
    break;
  }

  const { encryptedKey, iv, salt } = await encryptPrivateKey(
    importedPrivateKey,
    pin,
    telegramId.toString()
  );

  // Get or create user
  let user = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });

  if (!user) {
    const pinHash = hashPin(pin, telegramId.toString());
    const inserted = await db
      .insert(users)
      .values({
        telegramId,
        username: ctx.from?.username ?? null,
        firstName: ctx.from?.first_name ?? null,
        pinHash,
      })
      .returning();
    user = inserted[0];
  }

  const existingWallets = await db.query.wallets.findMany({
    where: eq(wallets.userId, user!.id),
  });

  // Deactivate existing
  if (existingWallets.length > 0) {
    await db.update(wallets).set({ isActive: false }).where(eq(wallets.userId, user!.id));
  }

  const walletName = `Imported Wallet ${existingWallets.length + 1}`;

  await db.insert(wallets).values({
    userId: user!.id,
    name: walletName,
    address: importedAddress,
    encryptedPrivateKey: encryptedKey,
    encryptedIv: iv,
    salt,
    isActive: true,
  });

  await ctx.reply(
    `Wallet imported successfully!\n\n` +
      `Name: ${walletName}\n` +
      `Address: <code>${importedAddress}</code>\n\n` +
      `Use /wallet to manage your wallets.`,
    { parse_mode: "HTML" }
  );
  } catch (err) {
    if (!(err instanceof CancelledError)) throw err;
  }
}
