import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { webSessions } from "@/src/db/schema";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("hoodbot_session")?.value;
  if (token) {
    await db.delete(webSessions).where(eq(webSessions.token, token));
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("hoodbot_session", "", { maxAge: 0, path: "/" });
  return res;
}
