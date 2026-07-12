const BASE_URL = "https://api.geckoterminal.com/api/v2";
const ROBINHOOD_NETWORK = "robinhood"; // GeckoTerminal network slug

export interface GeckoPool {
  id: string;
  address: string;
  name: string;
  baseTokenSymbol: string;
  quoteTokenSymbol: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  priceNative: string;
  priceUsd: string;
  volumeUsd24h: string;
  tvlUsd: string;
  feeTier: number;
  priceChangePercent24h: string;
}

export interface GeckoToken {
  address: string;
  symbol: string;
  name: string;
  priceUsd: string;
  fdvUsd: string;
  volumeUsd24h: string;
}

async function geckoFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Accept: "application/json",
        ...(process.env.GECKO_TERMINAL_API_KEY
          ? { Authorization: `Bearer ${process.env.GECKO_TERMINAL_API_KEY}` }
          : {}),
      },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

/** Fetch top pools on Robinhood Chain by TVL */
export async function getTopPools(limit = 10, network = ROBINHOOD_NETWORK): Promise<GeckoPool[]> {
  const data = await geckoFetch<{ data: { id: string; attributes: Record<string, string> }[] }>(
    `/networks/${network}/pools?page=1&limit=${limit}&sort=h24_volume_usd_descending`
  );
  if (!data?.data) return [];

  return data.data.map((item) => {
    const a = item.attributes;
    const relationships = (item as Record<string, unknown>).relationships as Record<string, { data: { id: string } }> | undefined;
    const baseToken = relationships?.base_token?.data?.id?.split("_")[1] ?? "";
    const quoteToken = relationships?.quote_token?.data?.id?.split("_")[1] ?? "";
    const name: string = a.name ?? "";
    const parts = name.split(" / ");
    return {
      id: item.id,
      address: a.address,
      name,
      baseTokenSymbol: parts[0] ?? "",
      quoteTokenSymbol: parts[1]?.split(" ")[0] ?? "",
      baseTokenAddress: baseToken,
      quoteTokenAddress: quoteToken,
      priceNative: a.base_token_price_native_currency ?? "0",
      priceUsd: a.base_token_price_usd ?? "0",
      volumeUsd24h: a.volume_usd?.h24 ?? "0",
      tvlUsd: a.reserve_in_usd ?? "0",
      feeTier: 0,
      priceChangePercent24h: a.price_change_percentage?.h24 ?? "0",
    } satisfies GeckoPool;
  });
}

/** Fetch single pool details by address */
export async function getPoolByAddress(
  address: string
): Promise<GeckoPool | null> {
  const data = await geckoFetch<{ data: { id: string; attributes: Record<string, string> } }>(
    `/networks/${ROBINHOOD_NETWORK}/pools/${address}`
  );
  if (!data?.data) return null;

  const a = data.data.attributes;
  const name: string = a.name ?? "";
  const parts = name.split(" / ");
  return {
    id: data.data.id,
    address: a.address,
    name,
    baseTokenSymbol: parts[0] ?? "",
    quoteTokenSymbol: parts[1]?.split(" ")[0] ?? "",
    baseTokenAddress: "",
    quoteTokenAddress: "",
    priceNative: a.base_token_price_native_currency ?? "0",
    priceUsd: a.base_token_price_usd ?? "0",
    volumeUsd24h: a.volume_usd?.h24 ?? "0",
    tvlUsd: a.reserve_in_usd ?? "0",
    feeTier: 0,
    priceChangePercent24h: a.price_change_percentage?.h24 ?? "0",
  };
}

/** Fetch token info by address */
export async function getTokenInfo(
  address: string
): Promise<GeckoToken | null> {
  const data = await geckoFetch<{ data: { attributes: Record<string, string> } }>(
    `/networks/${ROBINHOOD_NETWORK}/tokens/${address}`
  );
  if (!data?.data) return null;

  const a = data.data.attributes;
  return {
    address: a.address ?? address,
    symbol: a.symbol ?? "",
    name: a.name ?? "",
    priceUsd: a.price_usd ?? "0",
    fdvUsd: a.fdv_usd ?? "0",
    volumeUsd24h: a.volume_usd?.h24 ?? "0",
  };
}

/** Format USD amount for display */
export function formatUsd(value: string | number): string {
  const n = parseFloat(String(value));
  if (isNaN(n)) return "$0.00";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(4)}`;
}
