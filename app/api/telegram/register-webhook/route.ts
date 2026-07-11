import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/telegram/register-webhook
 * Calls Telegram's setWebhook API to register this deployment's webhook URL.
 * Automatically detects the current deployment URL from Vercel env vars.
 */
export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN not set" },
      { status: 400 }
    );
  }

  // Detect the current deployment base URL
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!host) {
    return NextResponse.json(
      { ok: false, error: "Could not determine deployment URL. Set VERCEL_URL." },
      { status: 400 }
    );
  }

  const protocol = host.includes("localhost") ? "http" : "https";
  const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

  const params = new URLSearchParams({
    url: webhookUrl,
    allowed_updates: JSON.stringify([
      "message",
      "callback_query",
      "inline_query",
    ]),
    ...(secret ? { secret_token: secret } : {}),
  });

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook?${params.toString()}`
  );
  const data = await res.json() as { ok: boolean; description?: string };

  if (!data.ok) {
    return NextResponse.json(
      { ok: false, description: data.description },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    webhookUrl,
    description: `Webhook registered: ${webhookUrl}`,
  });
}
