import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── DexScreener token data ────────────────────────────────────────────────────
async function getDexScreenerToken(address: string) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch { return null; }
}

// ── GeckoTerminal token info + top traders (multi-network search) ─────────────
const GECKO_NETWORKS = ["eth", "base", "robinhood", "sepolia-testnet"];

async function getGeckoTerminalToken(address: string) {
  for (const network of GECKO_NETWORKS) {
    try {
      const res = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${address}`,
        { headers: { Accept: "application/json" }, next: { revalidate: 30 } }
      );
      if (!res.ok) continue;
      const data = await res.json() as { data?: { attributes?: Record<string, unknown> } };
      if (data?.data?.attributes) return { network, ...data.data.attributes };
    } catch { continue; }
  }
  return null;
}

async function getGeckoTopPools(address: string, network: string) {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${address}/pools?page=1`,
      { headers: { Accept: "application/json" }, next: { revalidate: 30 } }
    );
    if (!res.ok) return [];
    const data = await res.json() as { data?: { attributes?: Record<string, unknown> }[] };
    return (data?.data ?? []).slice(0, 5).map((p) => p.attributes ?? {});
  } catch { return []; }
}

// ── Holder count via Etherscan-compatible explorers ───────────────────────────
async function getHolderCount(address: string, network: string): Promise<number | null> {
  const explorers: Record<string, string> = {
    eth: "https://api.etherscan.io/api",
    base: "https://api.basescan.org/api",
    "sepolia-testnet": "https://api-sepolia.etherscan.io/api",
  };
  const apiUrl = explorers[network];
  if (!apiUrl) return null;
  try {
    const res = await fetch(
      `${apiUrl}?module=token&action=tokenholderlist&contractaddress=${address}&page=1&offset=1`,
      { next: { revalidate: 60 } }
    );
    const data = await res.json() as { status?: string; result?: unknown[] };
    // Etherscan free tier doesn't expose total count directly — try stats endpoint
    const res2 = await fetch(
      `${apiUrl}?module=token&action=tokeninfo&contractaddress=${address}`,
      { next: { revalidate: 60 } }
    );
    const data2 = await res2.json() as { result?: { holdersCount?: string }[] };
    const count = parseInt(data2?.result?.[0]?.holdersCount ?? "0", 10);
    return count > 0 ? count : null;
  } catch { return null; }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const address = new URL(req.url).searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/i.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  // Run all fetches in parallel
  const [dexData, geckoToken] = await Promise.all([
    getDexScreenerToken(address),
    getGeckoTerminalToken(address),
  ]);

  // Pick the best pair from DexScreener (highest liquidity)
  const pairs = (dexData?.pairs ?? []) as Record<string, unknown>[];
  const bestPair = pairs.sort((a, b) =>
    parseFloat(String((b.liquidity as Record<string,unknown>)?.usd ?? 0)) -
    parseFloat(String((a.liquidity as Record<string,unknown>)?.usd ?? 0))
  )[0] ?? null;

  const geckoNetwork = (geckoToken as Record<string,unknown> | null)?.network as string | undefined;

  // Top pools from GeckoTerminal
  const topPools = geckoNetwork
    ? await getGeckoTopPools(address, geckoNetwork)
    : [];

  // Holder count
  const holderCount = geckoNetwork
    ? await getHolderCount(address, geckoNetwork)
    : null;

  // Build response
  const baseToken = (bestPair?.baseToken ?? {}) as Record<string,unknown>;
  const quoteToken = (bestPair?.quoteToken ?? {}) as Record<string,unknown>;
  const info = (bestPair?.info ?? {}) as Record<string,unknown>;

  // Determine if the address is the base or quote token
  const isBase = String(baseToken.address ?? "").toLowerCase() === address;
  const tokenMeta = isBase ? baseToken : quoteToken;

  const gt = geckoToken as Record<string, unknown> | null;

  return NextResponse.json({
    address,
    name: tokenMeta.name ?? gt?.name ?? "Unknown",
    symbol: tokenMeta.symbol ?? gt?.symbol ?? "?",
    network: geckoNetwork ?? (bestPair?.chainId as string | undefined) ?? "unknown",
    price_usd: bestPair?.priceUsd ?? gt?.price_usd ?? "0",
    fdv_usd: (bestPair?.fdv as string | undefined) ?? gt?.fdv_usd ?? "0",
    market_cap: (bestPair?.marketCap as string | undefined) ?? "0",
    volume_h24: (bestPair?.volume as Record<string,unknown>)?.h24 ?? gt?.volume_usd ?? "0",
    liquidity_usd: (bestPair?.liquidity as Record<string,unknown>)?.usd ?? "0",
    price_change_h24: (bestPair?.priceChange as Record<string,unknown>)?.h24 ?? "0",
    price_change_h6: (bestPair?.priceChange as Record<string,unknown>)?.h6 ?? "0",
    txns_h24: bestPair?.txns
      ? {
          buys: (bestPair.txns as Record<string,Record<string,number>>).h24?.buys ?? 0,
          sells: (bestPair.txns as Record<string,Record<string,number>>).h24?.sells ?? 0,
        }
      : null,
    // Token security (from gecko attributes)
    top10_holder_percent: gt?.top_10_holders_rate != null
      ? (parseFloat(String(gt.top_10_holders_rate)) * 100).toFixed(1)
      : null,
    creator_address: gt?.creator_address ?? null,
    creator_balance_percent: gt?.creator_token_balance != null && gt?.total_supply != null
      ? ((parseFloat(String(gt.creator_token_balance)) / parseFloat(String(gt.total_supply))) * 100).toFixed(2)
      : null,
    is_honeypot: gt?.is_honeypot ?? null,
    renounced: gt?.renounced ?? null,
    total_supply: gt?.total_supply ?? null,
    holder_count: holderCount,
    // Pools
    top_pools: topPools.slice(0, 3).map((p) => ({
      name: p.name,
      dex: p.dex_id ?? p.relationships,
      liquidity: (p.reserve_in_usd as string | undefined) ?? "0",
      volume_h24: (p.volume_usd as Record<string,string>)?.h24 ?? "0",
      price_change_h24: (p.price_change_percentage as Record<string,string>)?.h24 ?? "0",
    })),
    // Links
    pair_url: bestPair?.url as string | undefined,
    socials: Array.isArray(info?.socials) ? info.socials : [],
    websites: Array.isArray(info?.websites) ? info.websites : [],
    image_url: (info?.imageUrl as string | undefined) ?? gt?.image_url,
  });
}
