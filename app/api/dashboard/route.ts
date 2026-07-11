import { NextResponse } from "next/server";
import { db } from "@/src/db";
import { lpPositions, nftMints, wallets, users, autoMintWatchers } from "@/src/db/schema";
import { isNull, count, eq } from "drizzle-orm";

export const revalidate = 0;

export async function GET() {
  try {
    const [
      totalUsersResult,
      totalWalletsResult,
      openPositionsResult,
      totalMintsResult,
      activeWatchersResult,
      recentPositions,
      recentMints,
    ] = await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(wallets),
      db.select({ c: count() }).from(lpPositions).where(isNull(lpPositions.closedAt)),
      db.select({ c: count() }).from(nftMints),
      db.select({ c: count() }).from(autoMintWatchers).where(eq(autoMintWatchers.isActive, true)),
      db.query.lpPositions.findMany({
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: 20,
        where: isNull(lpPositions.closedAt),
      }),
      db.query.nftMints.findMany({
        orderBy: (t, { desc }) => [desc(t.mintedAt)],
        limit: 20,
      }),
    ]);

    return NextResponse.json({
      stats: {
        totalUsers: totalUsersResult[0]?.c ?? 0,
        totalWallets: totalWalletsResult[0]?.c ?? 0,
        openPositions: openPositionsResult[0]?.c ?? 0,
        totalMints: totalMintsResult[0]?.c ?? 0,
        activeWatchers: activeWatchersResult[0]?.c ?? 0,
      },
      positions: recentPositions,
      mints: recentMints,
    });
  } catch (err) {
    console.error("[Dashboard API]", err);
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
  }
}
