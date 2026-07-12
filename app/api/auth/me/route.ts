/**
 * GET /api/auth/me
 * Returns current logged-in user from session cookie.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      telegramId: user.telegramId.toString(),
    },
  });
}
