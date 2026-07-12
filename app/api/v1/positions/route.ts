import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";
import { getSessionUser } from "@/lib/session";
import { db } from "@/src/db";
import { lpPositions, wallets, users } from "@/src/db/schema";
import { eq, isNull, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/positions?telegramId=<id>
 * Returns all open LP positions for a user.
 *
 * GET /api/v1/positions
 * Returns all open LP positions across all users (admin).
 *
 * AI Agent usage:
 *   curl -H "X-API-Key: $HOODBOT_API_KEY" \
 *     "https://<domain>/api/v1/positions?telegramId=123456789"
 */
export async function GET(req: NextRequest) {
  // Web dashboard — session auth (no telegramId param needed)
  const sessionUser = await getSessionUser(req);
  if (sessionUser && !req.nextUrl.searchParams.has("telegramId")) {
    const positions = await db.query.lpPositions.findMany({
      where: eq(lpPositions.userId, sessionUser.id),
      orderBy: [desc(lpPositions.createdAt)],
    });
    return NextResponse.json({ positions });
  }

  // Bot / agent — API key auth
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const telegramId = searchParams.get("telegramId");

  try {
    if (telegramId) {
      // Positions for specific user
      const user = await db.query.users.findFirst({
        where: eq(users.telegramId, BigInt(telegramId)),
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const positions = await db.query.lpPositions.findMany({
        where: (t, { and }) => and(eq(t.userId, user.id), isNull(t.closedAt)),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      return NextResponse.json({
        telegramId,
        userId: user.id,
        openPositions: positions.length,
        positions: positions.map((p) => ({
          id: p.id,
          version: p.version,
          tokenId: p.tokenId,
          token0: p.token0,
          token1: p.token1,
          feeTier: p.feeTier,
          tickLower: p.tickLower,
          tickUpper: p.tickUpper,
          liquidity: p.liquidity,
          autoRebalance: p.autoRebalance,
          rebalanceThreshold: p.rebalanceThreshold,
          createdAt: p.createdAt,
        })),
      });
    }

    // All open positions (admin overview)
    const positions = await db.query.lpPositions.findMany({
      where: isNull(lpPositions.closedAt),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: 100,
    });

    return NextResponse.json({
      total: positions.length,
      positions: positions.map((p) => ({
        id: p.id,
        userId: p.userId,
        version: p.version,
        tokenId: p.tokenId,
        token0: p.token0,
        token1: p.token1,
        feeTier: p.feeTier,
        autoRebalance: p.autoRebalance,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    console.error("[HoodBot API] /v1/positions error:", err);
    return NextResponse.json({ error: "Failed to fetch positions" }, { status: 500 });
  }
}
