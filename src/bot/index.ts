import { Bot, session, InlineKeyboard } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { MyContext, SessionData } from "./types";
import { db } from "../db";
import { users, wallets, lpPositions, nftMints } from "../db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { createWalletConversation } from "./conversations/createWallet";
import { importWalletConversation } from "./conversations/importWallet";
import { addLiquidityV3Conversation } from "./conversations/addLiquidityV3";
import { addLiquidityV4Conversation } from "./conversations/addLiquidityV4";
import { mintNFTConversation } from "./conversations/mintNFT";
import { shortAddress } from "../utils/format";
import { getTopPools, formatUsd } from "../services/data/geckoTerminal";
import { getTokenSafety, formatSafetyReport } from "../services/data/gmgn";
import { getUserV3Positions } from "../services/uniswapV3";
import { isValidAddress } from "../services/wallet";
import { getPublicClient, getAddressUrl } from "../services/chain";
import { formatEther } from "viem";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

export const bot = new Bot<MyContext>(process.env.TELEGRAM_BOT_TOKEN);

// ── Middleware ─────────────────────────────────────────────────────────────────
bot.use(
  session<SessionData, MyContext>({
    initial: () => ({}),
  })
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
bot.use((conversations as any)());

// ── Register conversations ─────────────────────────────────────────────────────
bot.use(createConversation(createWalletConversation, "createWallet"));
bot.use(createConversation(importWalletConversation, "importWallet"));
bot.use(createConversation(addLiquidityV3Conversation, "addLiquidityV3"));
bot.use(createConversation(addLiquidityV4Conversation, "addLiquidityV4"));
bot.use(createConversation(mintNFTConversation, "mintNFT"));

// ── /start ─────────────────────────────────────────────────────────────────────
bot.command("start", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });

  const hasWallet = user
    ? (await db.query.wallets.findMany({ where: eq(wallets.userId, user.id) })).length > 0
    : false;

  const keyboard = new InlineKeyboard()
    .text("Create Wallet", "cmd_create_wallet")
    .text("Import Wallet", "cmd_import_wallet")
    .row()
    .text("Add LP (V3)", "cmd_add_lp_v3")
    .text("Add LP (V4)", "cmd_add_lp_v4")
    .row()
    .text("My Positions", "cmd_positions")
    .text("Mint NFT", "cmd_mint_nft")
    .row()
    .text("Market Data", "cmd_market")
    .text("Settings", "cmd_settings");

  await ctx.reply(
    `Welcome to HoodBot\n\n` +
      `Chain: Robinhood Chain (Chain ID 4663)\n` +
      `Features: Uniswap V3/V4 LP, Auto-Rebalance, NFT Minting\n\n` +
      (hasWallet
        ? `Your wallet is set up. Choose an action:`
        : `No wallet found. Create or import one to get started:`),
    { reply_markup: keyboard }
  );
});

// ── /cancel ────────────────────────────────────────────────────────────────────
bot.command("cancel", async (ctx) => {
  await ctx.conversation.exitAll();
  await ctx.reply(
    "Action cancelled. Use /start to return to the main menu.",
  );
});

// ── /help ──────────────────────────────────────────────────────────────────────
bot.command("help", async (ctx) => {
  await ctx.reply(
    `HoodBot Commands\n\n` +
      `/start — Main menu\n` +
      `/wallet — Wallet management\n` +
      `/balance — Check ETH balance of active wallet\n` +
      `/lp — Add/manage liquidity\n` +
      `/positions — View open LP positions\n` +
      `/nft — Mint NFTs\n` +
      `/market — Top pools & token data\n` +
      `/settings — Bot settings\n` +
      `/cancel — Cancel current action\n` +
      `/help — This message\n\n` +
      `Chain: Robinhood Mainnet (4663)\n` +
      `Explorer: https://robinhoodchain.blockscout.com\n\n` +
      `Tip: You can type /cancel at any time during a multi-step action to abort it.`
  );
});

// ── /balance ───────────────────────────────────────────────────────────────────
bot.command("balance", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });

  if (!user) {
    await ctx.reply("No account found. Use /start to create a wallet.");
    return;
  }

  const userWallets = await db.query.wallets.findMany({
    where: eq(wallets.userId, user.id),
  });

  if (userWallets.length === 0) {
    await ctx.reply("No wallets found. Use /wallet to create one.");
    return;
  }

  await ctx.reply("Fetching balances...");

  const client = getPublicClient();
  const lines: string[] = [];

  for (const w of userWallets) {
    try {
      const raw = await client.getBalance({ address: w.address as `0x${string}` });
      const eth = parseFloat(formatEther(raw)).toFixed(6);
      const activeTag = w.isActive ? " [ACTIVE]" : "";
      lines.push(`${w.name}${activeTag}\n  ${w.address}\n  Balance: ${eth} ETH`);
    } catch {
      lines.push(`${w.name}\n  ${w.address}\n  Balance: (could not fetch)`);
    }
  }

  const activeW = userWallets.find((w) => w.isActive);
  const explorerLine = activeW
    ? `\nView on Explorer: ${getAddressUrl(activeW.address)}`
    : "";

  await ctx.reply(
    `Wallet Balances\n\n${lines.join("\n\n")}${explorerLine}`,
  );
});

// ── /status ────────────────────────────────────────────────────────────────────
bot.command("status", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });

  const uptimeSeconds = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;

  if (!user) {
    await ctx.reply(
      `HoodBot Status\n\n` +
        `Bot: Online\n` +
        `Uptime: ${uptimeStr}\n` +
        `Chain: Robinhood Chain (4663)\n` +
        `Account: Not registered — use /start`
    );
    return;
  }

  const walletCount = (await db.query.wallets.findMany({ where: eq(wallets.userId, user.id) })).length;
  const activeWallet = await db.query.wallets.findFirst({
    where: and(eq(wallets.userId, user.id), eq(wallets.isActive, true)),
  });
  const openPositions = (await db.query.lpPositions.findMany({
    where: and(eq(lpPositions.userId, user.id), isNull(lpPositions.closedAt)),
  })).length;

  await ctx.reply(
    `HoodBot Status\n\n` +
      `Bot: Online\n` +
      `Uptime: ${uptimeStr}\n` +
      `Chain: Robinhood Chain (4663)\n\n` +
      `Account: @${user.username ?? user.firstName ?? "user"}\n` +
      `Wallets: ${walletCount}\n` +
      `Active wallet: ${activeWallet ? activeWallet.name + " (" + shortAddress(activeWallet.address) + ")" : "None"}\n` +
      `Open LP positions: ${openPositions}`
  );
});

// ── /wallet ────────────────────────────────────────────────────────────────────
bot.command("wallet", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Create New Wallet", "cmd_create_wallet")
    .row()
    .text("Import Wallet", "cmd_import_wallet")
    .row()
    .text("My Wallets", "cmd_list_wallets")
    .row()
    .text("Back", "cmd_start");

  await ctx.reply("Wallet Management:", { reply_markup: keyboard });
});

// ── /lp ────────────────────────────────────────────────────────────────────────
bot.command("lp", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Add LP (V3)", "cmd_add_lp_v3")
    .text("Add LP (V4)", "cmd_add_lp_v4")
    .row()
    .text("My Positions", "cmd_positions")
    .text("Collect Fees", "cmd_collect_fees")
    .row()
    .text("Auto-LP Settings", "cmd_auto_lp");

  await ctx.reply("Liquidity Management:", { reply_markup: keyboard });
});

// ── /positions ─────────────────────────────────────────────────────────────────
bot.command("positions", async (ctx) => {
  const telegramId = BigInt(ctx.from!.id);
  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, telegramId),
  });

  if (!user) {
    await ctx.reply("No wallet found. Use /start to get started.");
    return;
  }

  const positions = await db.query.lpPositions.findMany({
    where: and(eq(lpPositions.userId, user.id), isNull(lpPositions.closedAt)),
    orderBy: [desc(lpPositions.createdAt)],
  });

  if (positions.length === 0) {
    await ctx.reply("No open LP positions. Use /lp to add liquidity.");
    return;
  }

  const lines = positions.map((p, i) => {
    const autoTag = p.autoRebalance ? " [Auto-Rebalance ON]" : "";
    return (
      `${i + 1}. ${p.version.toUpperCase()} | ${shortAddress(p.token0)}/${shortAddress(p.token1)}` +
      `\n   Fee: ${p.feeTier / 10000}% | Range: [${p.tickLower ?? "?"}, ${p.tickUpper ?? "?"}]` +
      `\n   Token ID: ${p.tokenId ?? "N/A"}${autoTag}`
    );
  });

  await ctx.reply(
    `Open LP Positions (${positions.length})\n\n${lines.join("\n\n")}\n\nUse /lp to manage positions.`
  );
});

// ── /nft ───────────────────────────────────────────────────────────────────────
bot.command("nft", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Mint NFT", "cmd_mint_nft")
    .row()
    .text("My Mints", "cmd_my_mints")
    .row()
    .text("Auto-Mint Watchers", "cmd_auto_mint");

  await ctx.reply("NFT Tools:", { reply_markup: keyboard });
});

// ── /market ────────────────────────────────────────────────────────────────────
bot.command("market", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Top Pools", "cmd_top_pools")
    .text("Token Check", "cmd_token_check")
    .row()
    .text("Trending (Basedbot)", "cmd_trending");

  await ctx.reply("Market Data:", { reply_markup: keyboard });
});

// ── /settings ──────────────────────────────────────────────────────────────────
bot.command("settings", async (ctx) => {
  await ctx.reply(
    "Settings\n\n" +
      "Coming soon: slippage defaults, gas price preference, auto-LP thresholds.\n\n" +
      "Use inline menus for per-operation settings."
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Callback query router
// ─────────────────────────────────────────────────────────────────────────────
bot.callbackQuery("cmd_create_wallet", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("createWallet");
});

bot.callbackQuery("cmd_import_wallet", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("importWallet");
});

bot.callbackQuery("cmd_add_lp_v3", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("addLiquidityV3");
});

bot.callbackQuery("cmd_add_lp_v4", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("addLiquidityV4");
});

bot.callbackQuery("cmd_mint_nft", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("mintNFT");
});

bot.callbackQuery("cmd_positions", async (ctx) => {
  await ctx.answerCallbackQuery();
  // Trigger positions command logic
  const telegramId = BigInt(ctx.from!.id);
  const user = await db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
  if (!user) { await ctx.reply("No wallet found."); return; }

  const positions = await db.query.lpPositions.findMany({
    where: and(eq(lpPositions.userId, user.id), isNull(lpPositions.closedAt)),
  });

  if (positions.length === 0) {
    await ctx.reply("No open positions. Use Add LP to start earning fees.");
    return;
  }

  const lines = positions.map((p, i) =>
    `${i + 1}. ${p.version.toUpperCase()} | ${shortAddress(p.token0)}/${shortAddress(p.token1)} | Tick [${p.tickLower},${p.tickUpper}]`
  );
  await ctx.reply(`Open Positions:\n\n${lines.join("\n")}`);
});

bot.callbackQuery("cmd_list_wallets", async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = BigInt(ctx.from!.id);
  const user = await db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
  if (!user) { await ctx.reply("No account found."); return; }

  const userWallets = await db.query.wallets.findMany({ where: eq(wallets.userId, user.id) });

  if (userWallets.length === 0) {
    await ctx.reply("No wallets. Use Create or Import.");
    return;
  }

  const lines = userWallets.map(
    (w) => `${w.isActive ? "[ACTIVE] " : ""}${w.name}: <code>${w.address}</code>`
  );
  await ctx.reply(`Your Wallets:\n\n${lines.join("\n")}`, { parse_mode: "HTML" });
});

bot.callbackQuery("cmd_top_pools", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Fetching top pools from GeckoTerminal...");

  const pools = await getTopPools(10);

  if (pools.length === 0) {
    await ctx.reply(
      "Could not fetch pool data. Try again in a moment.\n\n" +
      "Manual: https://www.geckoterminal.com/robinhood/pools"
    );
    return;
  }

  const lines = pools.map((p, i) => {
    const change = parseFloat(p.priceChangePercent24h);
    const arrow = change >= 0 ? "+" : "";
    return (
      `${i + 1}. ${p.name}\n` +
      `   Price: $${parseFloat(p.priceUsd).toFixed(6)} (${arrow}${change.toFixed(2)}%)\n` +
      `   TVL: ${formatUsd(p.tvlUsd)} | Vol 24h: ${formatUsd(p.volumeUsd24h)}`
    );
  });

  await ctx.reply(`Top Pools — Robinhood Chain (Uniswap V3)\n\n${lines.join("\n\n")}`);
});

// Token check — stored per-user flag to avoid global message listener leak
const pendingTokenCheck = new Set<number>();

bot.callbackQuery("cmd_token_check", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id;
  pendingTokenCheck.add(userId);
  await ctx.reply(
    "Paste a token contract address to check safety.\n\n" +
    "Supported chains: Ethereum, Base, BSC, Arbitrum, Solana.\n" +
    "(Robinhood Chain tokens not yet supported by GMGN.ai)\n\n" +
    "Send /cancel to abort."
  );
});

bot.callbackQuery("cmd_trending", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Fetching trending pools...");

  // Fetch trending pools from GeckoTerminal DEX endpoint, sorted by tx count
  const data = await fetch(
    "https://api.geckoterminal.com/api/v2/networks/robinhood/dexes/uniswap-v3-robinhood/pools?sort=h24_tx_count_desc&page=1",
    { headers: { Accept: "application/json" } }
  ).then((r) => r.ok ? r.json() : null).catch(() => null) as { data: { attributes: Record<string, unknown> }[] } | null;

  const pools = data?.data ?? [];

  if (pools.length === 0) {
    await ctx.reply(
      "Could not fetch trending pools.\n\n" +
      "Manual: https://www.geckoterminal.com/robinhood/pools"
    );
    return;
  }

  const lines = pools.slice(0, 8).map((p, i) => {
    const a = p.attributes as Record<string, unknown>;
    const name = String(a.name ?? "Unknown");
    const price = parseFloat(String(a.base_token_price_usd ?? "0"));
    const vol = parseFloat(String((a.volume_usd as Record<string, string>)?.h24 ?? "0"));
    const txnsObj = a.transactions as Record<string, Record<string, number>> | undefined;
    const txns = Number(txnsObj?.h24?.buys ?? 0) + Number(txnsObj?.h24?.sells ?? 0);
    return `${i + 1}. ${name}\n   Price: $${price.toFixed(6)} | Vol: ${formatUsd(vol)} | Txns: ${txns}`;
  });

  await ctx.reply(`Trending Pools — Robinhood Chain\n\n${lines.join("\n\n")}`);
});

bot.callbackQuery("cmd_my_mints", async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = BigInt(ctx.from!.id);
  const user = await db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
  if (!user) { await ctx.reply("No account found."); return; }

  const mints = await db.query.nftMints.findMany({
    where: eq(nftMints.userId, user.id),
    orderBy: [desc(nftMints.mintedAt)],
  });

  if (mints.length === 0) {
    await ctx.reply("No mints yet. Use Mint NFT to get started.");
    return;
  }

  const lines = mints.slice(0, 10).map(
    (m, i) =>
      `${i + 1}. Contract: ${shortAddress(m.contractAddress)}\n   Qty: ${m.quantity} | TX: ${m.txHash ? shortAddress(m.txHash) : "N/A"}`
  );
  await ctx.reply(`Recent NFT Mints:\n\n${lines.join("\n\n")}`);
});

bot.callbackQuery("cmd_collect_fees", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Collect Fees feature — use /positions to see your positions, then select Collect Fees.");
});

bot.callbackQuery("cmd_auto_lp", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Auto-LP Rebalancer\n\n" +
      "To enable auto-rebalance on a position, use /positions and toggle it.\n\n" +
      "The bot checks your positions every 5 minutes and rebalances when price moves outside your range."
  );
});

bot.callbackQuery("cmd_auto_mint", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Auto-Mint Watchers\n\nUse /nft > Mint NFT > Auto-watch to set up a new watcher.");
});

bot.callbackQuery("cmd_start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Use /start to see the main menu.");
});

// ── Token check message handler ────────────────────────────────────────────────
// Handles address input after user clicks "Token Check" button.
// Uses a Set to track per-user pending state — no global listener leak.
bot.on("message:text", async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !pendingTokenCheck.has(userId)) return next();

  const text = ctx.message.text.trim();

  // Allow /cancel to abort
  if (text === "/cancel") {
    pendingTokenCheck.delete(userId);
    await ctx.reply("Token check cancelled.");
    return;
  }

  if (!isValidAddress(text)) {
    await ctx.reply("Invalid address format. Paste a valid 0x... contract address, or send /cancel to abort.");
    return;
  }

  pendingTokenCheck.delete(userId);
  await ctx.reply("Checking token safety...");

  // Try common chains — GMGN does not support Robinhood Chain yet
  let safety = await getTokenSafety(text, "eth");
  if (!safety) safety = await getTokenSafety(text, "base");
  if (!safety) safety = await getTokenSafety(text, "bsc");

  if (!safety) {
    await ctx.reply(
      "Could not fetch safety data for this token.\n\n" +
      "Note: GMGN.ai currently supports Ethereum, Base, BSC, Arbitrum, and Solana.\n" +
      "Robinhood Chain tokens are not yet indexed.\n\n" +
      "Check manually: https://gmgn.ai"
    );
    return;
  }

  await ctx.reply(formatSafetyReport(safety));
});

// ── Error handler ──────────────────────────────────────────────────────────────
bot.catch((err) => {
  console.error("[Bot Error]", err);
});
