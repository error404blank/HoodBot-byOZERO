import "dotenv/config";
import { bot } from "./bot";
import cron from "node-cron";
import { runAutoRebalanceCheck } from "./services/autoLP";

async function main() {
  console.log("[HoodBot] Starting bot...");

  // ── Auto-rebalance cron: every 5 minutes ──────────────────────────────────
  cron.schedule("*/5 * * * *", async () => {
    console.log("[Cron] Running auto-rebalance check...");

    const results = await runAutoRebalanceCheck(
      async (userId, message) => {
        try {
          await bot.api.sendMessage(userId, message);
        } catch (err) {
          console.error(`[Cron] Failed to notify user ${userId}:`, err);
        }
      },
      async (_userId, _walletId) => {
        // PIN resolver: in production, implement session-based PIN caching
        // or require users to authorize auto-rebalance upfront.
        // Returning null means the bot will ask the user to re-authorize.
        return null;
      }
    );

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    if (results.length > 0) {
      console.log(`[Cron] Rebalance: ${succeeded} succeeded, ${failed} failed`);
    }
  });

  // ── Start bot (long polling) ───────────────────────────────────────────────
  await bot.start({
    onStart: (info) => {
      console.log(`[HoodBot] Running as @${info.username}`);
      console.log(`[HoodBot] Chain: Robinhood Mainnet (4663)`);
    },
  });
}

main().catch((err) => {
  console.error("[HoodBot] Fatal error:", err);
  process.exit(1);
});
