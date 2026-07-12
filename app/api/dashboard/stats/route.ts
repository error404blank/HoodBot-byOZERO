import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull, count } from "drizzle-orm";
import { db } from "@/src/db";
import { wallets, lpPositions, nftMints } from "@/src/db/schema";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [walletCount, activePositions, totalMints] = await Promise.all([
    db.select({ c: count() }).from(wallets).where(eq(wallets.userId, user.id)),
    db.select({ c: count() }).from(lpPositions).where(
      and(eq(lpPositions.userId, user.id), isNull(lpPositions.closedAt))
    ),
    db.select({ c: count() }).from(nftMints).where(eq(nftMints.userId, user.id)),
  ]);

  return NextResponse.json({
    walletCount: walletCount[0]?.c ?? 0,
    activePositions: activePositions[0]?.c ?? 0,
    totalMints: totalMints[0]?.c ?? 0,
    username: user.username,
    firstName: user.firstName,
    telegramId: user.telegramId.toString(),
  });
}
