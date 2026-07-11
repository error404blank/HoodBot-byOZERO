import { NextRequest, NextResponse } from "next/server";

/**
 * Validates the X-API-Key header against HOODBOT_API_KEY env var.
 * Returns null if valid, or a 401/500 Response if not.
 */
export function requireApiKey(req: NextRequest): NextResponse | null {
  const apiKey = process.env.HOODBOT_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API key not configured on server. Set HOODBOT_API_KEY env var." },
      { status: 500 }
    );
  }
  const provided = req.headers.get("x-api-key");
  if (!provided || provided !== apiKey) {
    return NextResponse.json(
      { error: "Unauthorized. Provide valid X-API-Key header." },
      { status: 401 }
    );
  }
  return null;
}
