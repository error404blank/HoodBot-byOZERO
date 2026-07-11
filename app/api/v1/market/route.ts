import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/market?token=<address>
 * Returns price, volume, and pool info for a token on Robinhood Chain.
 * Data sourced from GeckoTerminal.
 *
 * AI Agent usage:
 *   curl -H "X-API-Key: $HOODBOT_API_KEY" \
 *     "https://<domain>/api/v1/market?token=0x..."
 */
export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const poolAddress = searchParams.get("pool");

  try {
    if (poolAddress) {
      // Fetch specific pool data
      const res = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/robinhood-chain/pools/${poolAddress}`,
        { headers: { Accept: "application/json" }, next: { revalidate: 30 } }
      );
      if (!res.ok) {
        return NextResponse.json({ error: "Pool not found" }, { status: 404 });
      }
      const data = await res.json();
      const attrs = data?.data?.attributes ?? {};
      return NextResponse.json({
        pool: poolAddress,
        baseToken: attrs.base_token_price_usd ?? null,
        quoteToken: attrs.quote_token_price_usd ?? null,
        priceUsd: attrs.base_token_price_usd ?? null,
        volume24h: attrs.volume_usd?.h24 ?? null,
        fdvUsd: attrs.fdv_usd ?? null,
        txCount24h: attrs.transactions?.h24 ?? null,
        liquidityUsd: attrs.reserve_in_usd ?? null,
        source: "GeckoTerminal",
      });
    }

    if (token) {
      // Fetch top pools for a token
      const res = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/robinhood-chain/tokens/${token}/pools?page=1`,
        { headers: { Accept: "application/json" }, next: { revalidate: 30 } }
      );
      if (!res.ok) {
        return NextResponse.json({ error: "Token not found on GeckoTerminal" }, { status: 404 });
      }
      const data = await res.json();
      const pools = (data?.data ?? []).slice(0, 5).map((p: Record<string, unknown>) => {
        const attrs = p.attributes as Record<string, unknown>;
        return {
          poolAddress: (p.id as string)?.split("_")[1] ?? p.id,
          name: attrs?.name,
          priceUsd: attrs?.base_token_price_usd,
          volume24h: (attrs?.volume_usd as Record<string, unknown>)?.h24,
          liquidityUsd: attrs?.reserve_in_usd,
          dex: (p.relationships as Record<string, unknown>)?.dex,
        };
      });
      return NextResponse.json({ token, pools, source: "GeckoTerminal" });
    }

    // Top pools on Robinhood Chain
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/robinhood-chain/pools?page=1`,
      { headers: { Accept: "application/json" }, next: { revalidate: 60 } }
    );
    const data = await res.json();
    const pools = (data?.data ?? []).slice(0, 10).map((p: Record<string, unknown>) => {
      const attrs = p.attributes as Record<string, unknown>;
      return {
        poolAddress: (p.id as string)?.split("_")[1] ?? p.id,
        name: attrs?.name,
        priceUsd: attrs?.base_token_price_usd,
        volume24h: (attrs?.volume_usd as Record<string, unknown>)?.h24,
        liquidityUsd: attrs?.reserve_in_usd,
      };
    });
    return NextResponse.json({ topPools: pools, chain: "Robinhood Chain (4663)", source: "GeckoTerminal" });
  } catch (err) {
    console.error("[HoodBot API] /v1/market error:", err);
    return NextResponse.json({ error: "Failed to fetch market data" }, { status: 500 });
  }
}
