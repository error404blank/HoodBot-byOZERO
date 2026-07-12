import {
  pgTable,
  serial,
  bigint,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const lpVersionEnum = pgEnum("lp_version", ["v3", "v4"]);

// ─── users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "bigint" }).unique().notNull(),
  username: text("username"),
  firstName: text("first_name"),
  pinHash: text("pin_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── wallets ──────────────────────────────────────────────────────────────────
export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull().default("Wallet 1"),
  address: text("address").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  encryptedIv: text("encrypted_iv").notNull(),
  salt: text("salt").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── lp_positions ─────────────────────────────────────────────────────────────
export const lpPositions = pgTable("lp_positions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  walletId: integer("wallet_id").notNull(),
  version: lpVersionEnum("version").notNull(),
  tokenId: text("token_id"),
  poolAddress: text("pool_address"),
  token0: text("token0").notNull(),
  token1: text("token1").notNull(),
  feeTier: integer("fee_tier").notNull(),
  tickLower: integer("tick_lower"),
  tickUpper: integer("tick_upper"),
  liquidity: text("liquidity"),
  autoRebalance: boolean("auto_rebalance").notNull().default(false),
  rebalanceThreshold: numeric("rebalance_threshold", {
    precision: 5,
    scale: 2,
  }).default("15.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

// ─── nft_mints ────────────────────────────────────────────────────────────────
export const nftMints = pgTable("nft_mints", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  walletId: integer("wallet_id").notNull(),
  contractAddress: text("contract_address").notNull(),
  tokenId: text("token_id"),
  quantity: integer("quantity").notNull().default(1),
  txHash: text("tx_hash"),
  mintedAt: timestamp("minted_at", { withTimezone: true }).defaultNow(),
});

// ─── auto_mint_watchers ───────────────────────────────────────────────────────
export const autoMintWatchers = pgTable("auto_mint_watchers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  walletId: integer("wallet_id").notNull(),
  contractAddress: text("contract_address").notNull(),
  quantity: integer("quantity").notNull().default(1),
  maxPriceEth: numeric("max_price_eth", { precision: 20, scale: 8 }),
  isActive: boolean("is_active").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── login_codes ──────────────────────────────────────────────────────────────
// Short-lived one-time codes generated on the web, confirmed via Telegram bot
export const loginCodes = pgTable("login_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  userId: integer("user_id"),                          // null until bot confirms
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── web_sessions ─────────────────────────────────────────────────────────────
export const webSessions = pgTable("web_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: integer("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── custom_rpcs ──────────────────────────────────────────────────────────────
export const customRpcs = pgTable("custom_rpcs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  chainId: integer("chain_id").notNull(),          // 1=Ethereum, 4663=Robinhood, 8453=Base
  chainName: text("chain_name").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type LpPosition = typeof lpPositions.$inferSelect;
export type NewLpPosition = typeof lpPositions.$inferInsert;
export type NftMint = typeof nftMints.$inferSelect;
export type AutoMintWatcher = typeof autoMintWatchers.$inferSelect;
export type LoginCode = typeof loginCodes.$inferSelect;
export type WebSession = typeof webSessions.$inferSelect;
export type CustomRpc = typeof customRpcs.$inferSelect;
export type NewCustomRpc = typeof customRpcs.$inferInsert;
