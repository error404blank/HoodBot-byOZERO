"use client";

import { useEffect, useState } from "react";

interface Position {
  id: number;
  version: string;
  token0: string;
  token1: string;
  feeTier: number;
  liquidity: string | null;
  createdAt: string;
  closedAt: string | null;
}

export function PositionsTab() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    fetch("/api/v1/positions")
      .then((r) => r.json())
      .then((d) => {
        const data = d as { positions: Position[] };
        setPositions(data.positions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = positions.filter((p) => showClosed || !p.closedAt);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-mono font-bold text-foreground">Positions</h2>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">Posisi LP di Robinhood Chain.</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="accent-primary"
          />
          <span className="text-xs font-mono text-muted-foreground">Tampilkan ditutup</span>
        </label>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-14 rounded-lg border border-border bg-card animate-pulse" />)}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
          <p className="text-sm font-mono text-muted-foreground">Tidak ada posisi aktif.</p>
          <p className="text-xs font-mono text-muted-foreground/60 mt-1">Buka bot Telegram untuk menambah posisi LP.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
          {filtered.map((p) => (
            <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-mono font-semibold text-foreground">
                    {p.token0.slice(0, 6)}/{p.token1.slice(0, 6)}
                  </span>
                  <span className={`text-[10px] font-mono border rounded px-1.5 py-0.5 leading-none ${
                    p.closedAt
                      ? "border-muted/30 text-muted-foreground"
                      : "border-primary/20 bg-primary/10 text-primary"
                  }`}>
                    {p.closedAt ? "Closed" : "Active"}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/60 border border-border rounded px-1.5 py-0.5">
                    {p.version.toUpperCase()} · {p.feeTier / 10000}%
                  </span>
                </div>
                <p className="text-xs font-mono text-muted-foreground/60">
                  Opened: {new Date(p.createdAt).toLocaleDateString("id-ID")}
                  {p.closedAt ? ` · Closed: ${new Date(p.closedAt).toLocaleDateString("id-ID")}` : ""}
                </p>
              </div>
              {p.liquidity && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-mono text-muted-foreground/60">Liquidity</p>
                  <p className="text-xs font-mono text-foreground">{BigInt(p.liquidity).toLocaleString()}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
