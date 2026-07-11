import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";
import { db } from "@/src/db";
import { wallets, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { getPublicClient } from "@/src/services/chain";
import { formatUnits } from "viem";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/wallets?telegramId=<id>
 * Returns wallets and ETH balances for a user.
 *
 * AI Agent usage:
 *   curl -H "X-API-Key: $HOODBOT_API_KEY" \
 *     "https://<domain>/api/v1/wallets?telegramId=123456789"
 */
export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const telegramId = searchParams.get("telegramId");

  if (!telegramId) {
    return NextResponse.json({ error: "telegramId query param required" }, { status: 400 });
  }

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.telegramId, BigInt(telegramId)),
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const userWallets = await db.query.wallets.findMany({
      where: eq(wallets.userId, user.id),
      orderBy: (t, { asc }) => [asc(t.id)],
    });

    const publicClient = getPublicClient();

    // Fetch ETH balances in parallel
    const walletsWithBalance = await Promise.all(
      userWallets.map(async (w) => {
        let ethBalance = "0";
        try {
          const balance = await publicClient.getBalance({ address: w.address as `0x${string}` });
          ethBalance = formatUnits(balance, 18);
        } catch {}
        return {
          id: w.id,
          name: w.name,
          address: w.address,
          isActive: w.isActive,
          ethBalance,
          createdAt: w.createdAt,
        };
      })
    );

    return NextResponse.json({
      telegramId,
      userId: user.id,
      wallets: walletsWithBalance,
    });
  } catch (err) {
    console.error("[HoodBot API] /v1/wallets error:", err);
    return NextResponse.json({ error: "Failed to fetch wallets" }, { status: 500 });
  }
}
