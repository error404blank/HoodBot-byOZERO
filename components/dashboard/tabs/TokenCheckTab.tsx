"use client";

import { useState } from "react";
import { useLang } from "@/lib/useLang";

interface TokenData {
  address: string;
  name: string;
  symbol: string;
  network: string;
  price_usd: string;
  fdv_usd: string;
  market_cap: string;
  volume_h24: string;
  liquidity_usd: string;
  price_change_h24: string;
  price_change_h6: string;
  txns_h24: { buys: number; sells: number } | null;
  top10_holder_percent: string | null;
  creator_address: string | null;
  creator_balance_percent: string | null;
  is_honeypot: boolean | null;
  renounced: boolean | null;
  total_supply: string | null;
  holder_count: number | null;
  top_pools: { name: string; dex: string; liquidity: string; volume_h24: string; price_change_h24: string }[];
  pair_url: string | undefined;
  image_url: string | undefined;
}

function fmt(val: string | number, decimals = 2): string {
  const n = parseFloat(String(val));
  if (isNaN(n)) return "—";
  if (n === 0) return "0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(decimals)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(decimals)}K`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(decimals)}`;
  return `$${n.toFixed(6)}`;
}

function fmtNum(val: string | number): string {
  const n = parseFloat(String(val));
  if (isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function PriceChange({ value }: { value: string }) {
  const n = parseFloat(value);
  if (isNaN(n)) return <span className="text-muted-foreground">—</span>;
  const color = n > 0 ? "text-primary" : n < 0 ? "text-destructive" : "text-muted-foreground";
  return <span className={`font-mono ${color}`}>{n > 0 ? "+" : ""}{n.toFixed(2)}%</span>;
}

function Badge({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground">—</span>;
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
      ok
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-primary/30 bg-primary/5 text-primary"
    }`}>
      {ok ? label : `No ${label}`}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/40 last:border-0">
      <span className="text-xs font-mono text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-mono text-foreground text-right break-all">{value}</span>
    </div>
  );
}

export function TokenCheckTab() {
  const [address, setAddress] = useState("");
  const [data, setData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { tr } = useLang();

  async function check() {
    const addr = address.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setError("Invalid address format.");
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/v1/token-check?address=${addr}`);
      const json = await res.json() as TokenData & { error?: string };
      if (json.error) { setError(json.error); return; }
      if (json.price_usd === "0" && json.fdv_usd === "0" && !json.holder_count) {
        setError("Token not found on any supported chain. Make sure the address is correct.");
        return;
      }
      setData(json);
    } catch { setError("Failed to fetch token data."); }
    finally { setLoading(false); }
  }

  const riskColor = () => {
    if (data?.is_honeypot) return "border-destructive/50 bg-destructive/10 text-destructive";
    const top10 = parseFloat(data?.top10_holder_percent ?? "0");
    if (top10 > 60) return "border-yellow-500/40 bg-yellow-500/10 text-yellow-400";
    return "border-primary/30 bg-primary/5 text-primary";
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-base font-mono font-bold text-foreground">{tr.tokenCheckTitle}</h2>
        <p className="text-xs font-mono text-muted-foreground mt-0.5">{tr.tokenCheckDesc}</p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && !loading) check();
          }}
          placeholder={tr.pasteAddress}
          spellCheck={false}
          className="flex-1 min-w-0 bg-card border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/60 transition-colors"
        />
        <button
          onClick={check}
          disabled={loading || !address.trim()}
          className="shrink-0 px-4 py-2 text-sm font-mono font-semibold rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors"
        >
          {loading ? tr.checking : tr.checkToken}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-xs font-mono text-destructive">{error}</p>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      )}

      {data && !loading && (
        <div className="space-y-4">
          {/* Token header */}
          <div className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${riskColor()}`}>
            <div className="flex items-center gap-3 min-w-0">
              {data.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.image_url} alt={data.symbol} className="w-9 h-9 rounded-full border border-border shrink-0 object-cover" />
              )}
              {!data.image_url && (
                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-mono font-bold text-primary">{data.symbol[0]}</span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-mono font-bold text-foreground">{data.name}</p>
                <p className="text-xs font-mono text-muted-foreground">{data.symbol} · {data.network}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-base font-mono font-bold">{fmt(data.price_usd, 6)}</p>
              <PriceChange value={data.price_change_h24} />
            </div>
          </div>

          {/* Market data grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: tr.marketCap, value: fmt(data.market_cap || data.fdv_usd) },
              { label: tr.volume24h, value: fmt(data.volume_h24) },
              { label: "Liquidity", value: fmt(data.liquidity_usd) },
              { label: tr.holders, value: data.holder_count ? fmtNum(data.holder_count) : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border bg-card px-3 py-3">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className="text-lg font-mono font-bold text-foreground mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Transactions */}
          {data.txns_h24 && (
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Txns 24h</p>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono font-bold text-primary">{data.txns_h24.buys} buys</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-sm font-mono font-bold text-destructive">{data.txns_h24.sells} sells</span>
                <div className="flex-1 h-2 rounded-full bg-border overflow-hidden ml-2">
                  {data.txns_h24.buys + data.txns_h24.sells > 0 && (
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.round((data.txns_h24.buys / (data.txns_h24.buys + data.txns_h24.sells)) * 100)}%` }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Security */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/50 bg-card/50">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Security</h3>
            </div>
            <div className="px-4">
              <InfoRow label={tr.riskLevel} value={
                <div className="flex gap-1.5 flex-wrap justify-end">
                  <Badge ok={data.is_honeypot} label={tr.honeypot} />
                  <Badge ok={data.renounced === false ? null : !data.renounced} label={tr.renounced} />
                </div>
              } />
              <InfoRow label={tr.topTraders} value={
                data.top10_holder_percent != null
                  ? <span className={parseFloat(data.top10_holder_percent) > 50 ? "text-yellow-400" : "text-foreground"}>
                      {data.top10_holder_percent}%
                    </span>
                  : "—"
              } />
              <InfoRow label={tr.devHolding} value={
                data.creator_balance_percent != null
                  ? `${data.creator_balance_percent}%`
                  : "—"
              } />
              <InfoRow label="Total Supply" value={
                data.total_supply ? fmtNum(data.total_supply) : "—"
              } />
              {data.creator_address && (
                <InfoRow label="Dev Address" value={
                  <span className="text-[11px]">
                    {data.creator_address.slice(0, 8)}...{data.creator_address.slice(-6)}
                  </span>
                } />
              )}
            </div>
          </div>

          {/* Top Pools */}
          {data.top_pools.length > 0 && (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/50 bg-card/50">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Top Pools</h3>
              </div>
              <div className="divide-y divide-border/40">
                {data.top_pools.map((pool, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-foreground truncate">{String(pool.name ?? "—")}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">
                        Liq: {fmt(pool.liquidity)} · Vol: {fmt(pool.volume_h24)}
                      </p>
                    </div>
                    <PriceChange value={String(pool.price_change_h24)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DexScreener link */}
          {data.pair_url && (
            <a
              href={data.pair_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-border bg-card text-xs font-mono text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M6 2H2v10h10V8M8 2h4v4M6 8l6-6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              View on DexScreener
            </a>
          )}
        </div>
      )}
    </div>
  );
}
