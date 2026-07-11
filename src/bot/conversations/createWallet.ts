import type { Conversation } from "@grammyjs/conversations";
import type { MyContext } from "../types";
import { db } from "../../db";
import { users, wallets } from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  generateWallet,
  encryptPrivateKey,
  isValidPin,
  hashPin,
} from "../../services/wallet";

export async function createWalletConversation(
  conversation: Conversation<MyContext>,
  ctx: MyContext
) {
  const telegramId = BigInt(ctx.from!.id);

  await ctx.reply(
    "Create a new wallet\n\n" +
      "You'll need a 6-digit PIN to secure your wallet.\n" +
      "This PIN encrypts your private key — never share it.\n\n" +
      "Enter your 6-digit PIN:"
  );

  let pin = "";
  while (true) {
    const pinMsg = await conversation.waitFor("message:text");
    pin = pinMsg.message.text.trim();

    // Delete the PIN message immediately for security
    try {
      await pinMsg.deleteMessage();
    } catch {}

    if (!isValidPin(pin)) {
      await ctx.reply("PIN must be exactly 6 digits. Try again:");
      continue;
    }
    break;
  }

  await ctx.reply("Confirm your PIN by entering it again:");
  while (true) {
    const confirmMsg = await conversation.waitFor("message:text");
    const confirm = confirmMsg.message.text.trim();

    try {
      await confirmMsg.deleteMessage();
    } catch {}

    if (confirm !== pin) {
      await ctx.reply("PINs do not match. Enter a new 6-digit PIN:");
      while (true) {
        const retryMsg = await conversation.waitFor("message:text");
        pin = retryMsg.message.text.trim();
        try { await retryMsg.deleteMessage(); } catch {}
        if (!isValidPin(pin)) {
          await ctx.reply("PIN must be exactly 6 digits. Try again:");
          continue;
        }
        break;
      }
      await ctx.reply("Confirm your PIN:");
      continue;
    }
    break;
  }

  // Generate wallet
  const wallet = generateWallet();
  const { encryptedKey, iv, salt } = await encryptPrivateKey(
    wallet.privateKey,
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

  // Count existing wallets for naming
  const existingWallets = await db.query.wallets.findMany({
    where: eq(wallets.userId, user!.id),
  });
  const walletName = `Wallet ${existingWallets.length + 1}`;

  // Deactivate current active wallet
  if (existingWallets.length > 0) {
    await db
      .update(wallets)
      .set({ isActive: false })
      .where(eq(wallets.userId, user!.id));
  }

  // Save wallet
  await db.insert(wallets).values({
    userId: user!.id,
    name: walletName,
    address: wallet.address,
    encryptedPrivateKey: encryptedKey,
    encryptedIv: iv,
    salt,
    isActive: true,
  });

  // Show mnemonic ONCE — warn user
  const mnemonicDisplay =
    wallet.mnemonic
      .split(" ")
      .map((word, i) => `${i + 1}. ${word}`)
      .join("  ") || "N/A";

  await ctx.reply(
    `Wallet created successfully!\n\n` +
      `Name: ${walletName}\n` +
      `Address: <code>${wallet.address}</code>\n\n` +
      `SEED PHRASE (shown ONCE — save it now):\n\n` +
      `<code>${mnemonicDisplay}</code>\n\n` +
      `This message will not appear again. Store it safely offline.`,
    { parse_mode: "HTML" }
  );

  await ctx.reply(
    `Your wallet is ready.\nAddress: <code>${wallet.address}</code>\n\nUse /wallet to manage wallets.`,
    { parse_mode: "HTML" }
  );
}
