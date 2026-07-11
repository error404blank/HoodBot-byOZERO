import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";
import { db } from "@/src/db";
import { lpPositions, wallets, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { decryptPrivateKey } from "@/src/services/wallet";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/lp
 * Trigger an LP action on behalf of a user.
 *
 * Body (add_v3):
 * {
 *   "action": "add_v3",
 *   "telegramId": "123456789",
 *   "walletId": 1,
 *   "pin": "123456",
 *   "token0": "0x...",
 *   "token1": "0x...",
 *   "fee": 3000,
 *   "amount0": "0.01",
 *   "amount1": "10",
 *   "rangePct": 20
 * }
 *
 * Body (collect_fees):
 * {
 *   "action": "collect_fees",
 *   "telegramId": "123456789",
 *   "walletId": 1,
 *   "pin": "123456",
 *   "tokenId": "12345"
 * }
 *
 * Body (pool_info):
 * {
 *   "action": "pool_info",
 *   "token0": "0x...",
 *   "token1": "0x...",
 *   "fee": 3000
 * }
 *
 * AI Agent usage:
 *   curl -X POST -H "X-API-Key: $HOODBOT_API_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"action":"pool_info","token0":"0x...","token1":"0x...","fee":3000}' \
 *     "https://<domain>/api/v1/lp"
 */
export async function POST(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action as string;

  // Lazy import to prevent Turbopack static eval of viem parseAbi at build time
  const { getV3Pool, addLiquidityV3, collectFeesV3 } = await import("@/src/services/uniswapV3");

  // ── pool_info — no wallet needed ─────────────────────────────────────────
  if (action === "pool_info") {
    const { token0, token1, fee } = body as { token0: string; token1: string; fee: number };
    if (!token0 || !token1 || !fee) {
      return NextResponse.json({ error: "token0, token1, fee required" }, { status: 400 });
    }
    try {
      const pool = await getV3Pool(token0, token1, fee as 100 | 500 | 3000 | 10000);
      if (!pool) return NextResponse.json({ error: "Pool not found" }, { status: 404 });
      return NextResponse.json({ pool });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── Actions that require wallet + PIN ─────────────────────────────────────
  const telegramId = body.telegramId as string;
  const walletId = body.walletId as number;
  const pin = body.pin as string;

  if (!telegramId || !walletId || !pin) {
    return NextResponse.json(
      { error: "telegramId, walletId, pin required for wallet actions" },
      { status: 400 }
    );
  }

  // Resolve user
  const user = await db.query.users.findFirst({
    where: eq(users.telegramId, BigInt(telegramId)),
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Resolve wallet — must belong to this user
  const wallet = await db.query.wallets.findFirst({
    where: (t, { and }) => and(eq(t.id, walletId), eq(t.userId, user.id)),
  });
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  // Decrypt private key
  let privateKey: `0x${string}`;
  try {
    const raw = await decryptPrivateKey(
      wallet.encryptedPrivateKey,
      wallet.encryptedIv,
      wallet.salt,
      pin,
      telegramId
    );
    privateKey = raw as `0x${string}`;
  } catch {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
  }

  // ── add_v3 ────────────────────────────────────────────────────────────────
  if (action === "add_v3") {
    const { token0, token1, fee, amount0, amount1, rangePct } = body as {
      token0: string; token1: string; fee: number;
      amount0: string; amount1: string; rangePct?: number;
    };

    if (!token0 || !token1 || !fee || !amount0 || !amount1) {
      return NextResponse.json(
        { error: "token0, token1, fee, amount0, amount1 required" },
        { status: 400 }
      );
    }

    try {
      const pool = await getV3Pool(token0, token1, fee as 100 | 500 | 3000 | 10000);
      if (!pool) return NextResponse.json({ error: "Pool not found on Robinhood Chain" }, { status: 404 });

      const pct = rangePct ?? 20;
      const tickRange = Math.floor((pct / 100) * Math.abs(pool.currentTick));
      const tickSpacing = pool.tickSpacing;
      const tickLower = Math.floor((pool.currentTick - tickRange) / tickSpacing) * tickSpacing;
      const tickUpper = Math.ceil((pool.currentTick + tickRange) / tickSpacing) * tickSpacing;

      const result = await addLiquidityV3({
        token0: pool.token0,
        token1: pool.token1,
        fee: fee as 100 | 500 | 3000 | 10000,
        amount0,
        amount1,
        tickLower,
        tickUpper,
        privateKey,
        recipientAddress: wallet.address,
      });

      // Record in DB
      await db.insert(lpPositions).values({
        userId: user.id,
        walletId: wallet.id,
        version: "v3",
        tokenId: result.tokenId,
        poolAddress: pool.address,
        token0: pool.token0,
        token1: pool.token1,
        feeTier: fee,
        tickLower,
        tickUpper,
        autoRebalance: false,
      });

      return NextResponse.json({
        success: true,
        txHash: result.txHash,
        tokenId: result.tokenId,
        pool: pool.address,
        tickLower,
        tickUpper,
        explorerUrl: `https://robinhoodchain.blockscout.com/tx/${result.txHash}`,
      });
    } catch (err) {
      console.error("[HoodBot API] add_v3 error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── collect_fees ──────────────────────────────────────────────────────────
  if (action === "collect_fees") {
    const { tokenId } = body as { tokenId: string };
    if (!tokenId) return NextResponse.json({ error: "tokenId required" }, { status: 400 });

    try {
      const result = await collectFeesV3({
        tokenId,
        privateKey,
        recipientAddress: wallet.address,
      });
      return NextResponse.json({
        success: true,
        txHash: result.txHash,
        explorerUrl: `https://robinhoodchain.blockscout.com/tx/${result.txHash}`,
      });
    } catch (err) {
      console.error("[HoodBot API] collect_fees error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
