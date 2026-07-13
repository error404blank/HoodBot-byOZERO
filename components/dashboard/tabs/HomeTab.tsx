"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/useLang";

interface Stats {
  walletCount: number;
  activePositions: number;
  totalMints: number;
  username: string | null;
  firstName: string | null;
  telegramId: string;
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-4 flex flex-col gap-1 ${accent ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-3xl font-mono font-bold leading-none ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[11px] font-mono text-muted-foreground/60">{sub}</p>}
    </div>
  );
}

export function HomeTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const { tr } = useLang();

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((d) => { setStats(d as Stats); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-14 rounded-lg border border-border bg-card animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const name = stats?.firstName ?? stats?.username ?? null;
  const quicksteps = [tr.qs1, tr.qs2, tr.qs3, tr.qs4];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">

      {/* Greeting bar */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-mono font-bold text-foreground truncate">
            {name ? tr.greeting(name) : tr.dashboard}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground truncate">
            {stats?.username ? `@${stats.username} · ` : ""}
            ID: {stats?.telegramId ?? "—"}
          </p>
        </div>
        <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono text-primary border border-primary/20 bg-primary/5 rounded px-2 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {tr.online}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label={tr.walletsCount} value={stats?.walletCount ?? 0} sub={tr.stored} accent />
        <StatCard label={tr.lpPositions} value={stats?.activePositions ?? 0} sub={tr.active} />
        <StatCard label={tr.totalMints} value={stats?.totalMints ?? 0} sub={tr.minted} />
        <StatCard label={tr.chains} value={4} sub={tr.supported} />
      </div>

      {/* Quick guide */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 bg-card/50">
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{tr.quickstart}</h3>
        </div>
        <div className="divide-y divide-border/40">
          {quicksteps.map((text, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-[10px] font-mono font-bold text-primary">
                {i + 1}
              </span>
              <span className="text-xs font-mono text-muted-foreground leading-relaxed">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bot link */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5">{tr.telegramBot}</p>
          <p className="text-sm font-mono text-foreground truncate">
            {process.env.NEXT_PUBLIC_BOT_USERNAME ? `@${process.env.NEXT_PUBLIC_BOT_USERNAME}` : "@HoodBot"}
          </p>
        </div>
        <a
          href={`https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME ?? "HoodBot"}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-mono px-3 py-1.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
        >
          {tr.openBot}
        </a>
      </div>
    </div>
  );
}
