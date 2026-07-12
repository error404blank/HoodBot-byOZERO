/**
 * POST /api/auth/code
 * Generates a 6-digit one-time login code (expires in 5 min).
 * Returns { code, expiresAt } — the web shows it, user sends /login CODE to the bot.
 *
 * GET /api/auth/code?code=XXXXXX
 * Polls for session token after bot confirms the code.
 * Returns { status: "pending" | "confirmed", token? }
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@/src/db";
import { loginCodes, webSessions } from "@/src/db/schema";

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST() {
  const code = randomCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await db.insert(loginCodes).values({ code, expiresAt });

  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const now = new Date();

  const loginCode = await db.query.loginCodes.findFirst({
    where: and(
      eq(loginCodes.code, code),
      gt(loginCodes.expiresAt, now)
    ),
  });

  if (!loginCode) {
    return NextResponse.json({ status: "expired" }, { status: 410 });
  }

  if (!loginCode.userId || !loginCode.usedAt) {
    return NextResponse.json({ status: "pending" });
  }

  // Bot confirmed — find or create session
  const session = await db.query.webSessions.findFirst({
    where: and(
      eq(webSessions.userId, loginCode.userId),
      gt(webSessions.expiresAt, now)
    ),
  });

  if (!session) return NextResponse.json({ status: "pending" });

  return NextResponse.json({ status: "confirmed", token: session.token });
}
