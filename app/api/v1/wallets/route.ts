import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";
import { getSessionUser } from "@/lib/session";
import { db } from "@/src/db";
import { wallets, users } from "@/src/db/schema";
import { eq, and } from "drizzle-orm";
import { getPublicClient } from "@/src/services/chain";
import { formatUnits } from "viem";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/v1/wallets  { walletId: number, name: string }
 * Rename a wallet — session auth required.
 */
export async function PATCH(req: NextRequest) {
  const sessionUser = await getSessionUser(req);
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { walletId?: number; name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { walletId, name } = body;
  if (!walletId || !name?.trim()) {
    return NextResponse.json({ error: "walletId and name required" }, { status: 400 });
  }

  const trimmed = name.trim().slice(0, 32);

  // Ensure wallet belongs to this user
  const wallet = await db.query.wallets.findFirst({
    where: and(eq(wallets.id, walletId), eq(wallets.userId, sessionUser.id)),
  });
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  await db.update(wallets).set({ name: trimmed }).where(eq(wallets.id, walletId));
  return NextResponse.json({ ok: true, name: trimmed });
}

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
