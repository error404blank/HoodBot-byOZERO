import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";
import { bot } from "@/src/bot";

// Secret token to verify requests are from Telegram
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

/**
 * POST /api/telegram/webhook
 * Telegram calls this endpoint with each update when webhook mode is active.
 * Register the webhook once via:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-domain>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
 */
export async function POST(req: NextRequest) {
  // Validate secret header (prevent spoofed updates)
  if (SECRET) {
    const header = req.headers.get("x-telegram-bot-api-secret-token");
    if (header !== SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const handler = webhookCallback(bot, "std/http");
    return await handler(req);
  } catch (err) {
    console.error("[HoodBot] Webhook error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Health check
export function GET() {
  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return NextResponse.json({
    status: "ok",
    bot: "HoodBot",
    chain: "Robinhood Mainnet (4663)",
    tokenConfigured: hasToken,
    mode: "webhook",
  });
}
