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
  // Same-origin dashboard requests don't need API key
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const isSameOrigin = origin ? origin.includes(host ?? "") : true;
  if (!isSameOrigin) {
    const auth = requireApiKey(req);
    if (auth) return auth;
  }

  const { searchParams } = new URL(req.url);
  const telegramId = searchParams.get("telegramId");

  try {
    // Without telegramId → return all wallets (for dashboard wallet selector)
    const userWallets = telegramId
      ? await db.query.wallets.findMany({
          where: eq(wallets.userId,
            (await db.query.users.findFirst({ where: eq(users.telegramId, BigInt(telegramId)) }))?.id ?? 0
          ),
          orderBy: (t, { asc }) => [asc(t.id)],
        })
      : await db.query.wallets.findMany({
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

    return NextResponse.json({ wallets: walletsWithBalance });
  } catch (err) {
    console.error("[HoodBot API] /v1/wallets error:", err);
    return NextResponse.json({ error: "Failed to fetch wallets" }, { status: 500 });
  }
}
