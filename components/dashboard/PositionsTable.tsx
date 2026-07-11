"use client";

interface Position {
  id: number;
  version: string;
  token0: string;
  token1: string;
  feeTier: number;
  tickLower: number | null;
  tickUpper: number | null;
  tokenId: string | null;
  autoRebalance: boolean;
  createdAt: Date | null;
}

interface PositionsTableProps {
  positions: Position[];
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function PositionsTable({ positions }: PositionsTableProps) {
  if (positions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground font-mono text-sm">No open LP positions</p>
        <p className="text-muted-foreground/60 text-xs mt-1">Use the bot&apos;s /lp command to add liquidity</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-muted-foreground">Version</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-muted-foreground">Pair</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-muted-foreground">Fee</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-muted-foreground">Range</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-muted-foreground">Token ID</th>
              <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-muted-foreground">Auto</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => (
              <tr key={pos.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    pos.version === "v4" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary"
                  }`}>
                    {pos.version.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground">
                  {shortAddr(pos.token0)} / {shortAddr(pos.token1)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {(pos.feeTier / 10000).toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  [{pos.tickLower ?? "?"}, {pos.tickUpper ?? "?"}]
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {pos.tokenId ?? "N/A"}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    pos.autoRebalance
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {pos.autoRebalance ? "ON" : "OFF"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
