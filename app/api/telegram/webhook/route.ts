import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";

// Force dynamic — this route depends on runtime env vars (TELEGRAM_BOT_TOKEN)
export const dynamic = "force-dynamic";

// Module-level singleton so the Bot instance (and all its middleware/conversations)
// is reused across requests in the same Node.js worker process.
let cachedHandler: ((req: Request) => Promise<Response>) | null = null;

async function getHandler() {
  if (!cachedHandler) {
    const { bot } = await import("@/src/bot");
    cachedHandler = webhookCallback(bot, "std/http");
  }
  return cachedHandler;
}

/**
 * POST /api/telegram/webhook
 * Telegram sends every update here when webhook mode is active.
 * Register the webhook once via the dashboard "Daftarkan Webhook" button,
 * or manually:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<domain>/api/telegram/webhook"
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

  // Optional: validate Telegram's secret token header
  if (secret) {
    const header = req.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
  }

  try {
    const handler = await getHandler();
    return await handler(req);
  } catch (err) {
    console.error("[HoodBot] Webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET — health check, used by the dashboard WebhookPanel
export function GET() {
  return NextResponse.json({
    status: "ok",
    bot: "HoodBot",
    chain: "Robinhood Mainnet (4663)",
    tokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    mode: "webhook",
  });
}
