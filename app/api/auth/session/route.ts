/**
 * POST /api/auth/session
 * Sets the hoodbot_session cookie after successful login.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@/src/db";
import { webSessions } from "@/src/db/schema";

export async function POST(req: NextRequest) {
  const { token } = await req.json() as { token: string };
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const session = await db.query.webSessions.findFirst({
    where: and(eq(webSessions.token, token), gt(webSessions.expiresAt, new Date())),
  });

  if (!session) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("hoodbot_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
