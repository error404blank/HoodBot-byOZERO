import { NextRequest, NextResponse } from "next/server";

// Force dynamic so Next.js never tries to statically evaluate this route.
// The bot module pulls in grammy + viem + pg which all need runtime env vars.
export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/webhook
 * Telegram calls this endpoint with each update when webhook mode is active.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

  // Validate secret header to prevent spoofed updates
  if (secret) {
    const header = req.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Dynamically import the bot at request time to avoid static evaluation
    const { bot } = await import("@/src/bot");
    const { webhookCallback } = await import("grammy");
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
