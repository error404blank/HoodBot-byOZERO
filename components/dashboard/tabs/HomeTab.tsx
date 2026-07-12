"use client";

import { useEffect, useState } from "react";

interface Stats {
  walletCount: number;
  activePositions: number;
  totalMints: number;
  username: string | null;
  firstName: string | null;
  telegramId: string;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-4">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-mono font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs font-mono text-muted-foreground/60 mt-0.5">{sub}</p>}
    </div>
  );
}

export function HomeTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((d) => { setStats(d as Stats); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg border border-border bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      {/* Greeting */}
      <div>
        <h2 className="text-lg font-mono font-bold text-foreground">
          {stats?.firstName ? `Halo, ${stats.firstName}` : "Dashboard"}
        </h2>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          {stats?.username ? `@${stats.username} · ` : ""}
          Telegram ID: {stats?.telegramId ?? "—"}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Wallets" value={stats?.walletCount ?? 0} sub="tersimpan di DB" />
        <StatCard label="Posisi LP" value={stats?.activePositions ?? 0} sub="aktif di chain" />
        <StatCard label="Total Mint" value={stats?.totalMints ?? 0} sub="NFT dimint" />
      </div>

      {/* Quick guide */}
      <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
        <div className="px-4 py-3">
          <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Mulai Cepat</h3>
        </div>
        {[
          { step: "1", text: "Buat atau import wallet di tab Wallets" },
          { step: "2", text: "Pilih chain dan contract di NFTHood untuk mint" },
          { step: "3", text: "Kirim ETH dari tab Send" },
          { step: "4", text: "Tambah custom RPC di tab RPCs jika perlu" },
        ].map(({ step, text }) => (
          <div key={step} className="flex items-start gap-4 px-4 py-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-[10px] font-mono font-bold text-primary mt-0.5">
              {step}
            </span>
            <span className="text-sm font-mono text-muted-foreground">{text}</span>
          </div>
        ))}
      </div>

      {/* Bot status */}
      <div className="rounded-lg border border-border bg-card px-4 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-1">Bot Telegram</p>
          <p className="text-sm font-mono text-foreground">
            {process.env.NEXT_PUBLIC_BOT_USERNAME
              ? `@${process.env.NEXT_PUBLIC_BOT_USERNAME}`
              : "Set NEXT_PUBLIC_BOT_USERNAME"}
          </p>
        </div>
        <a
          href={`https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME ?? ""}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-mono px-3 py-1.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          Buka Bot
        </a>
      </div>
    </div>
  );
}
