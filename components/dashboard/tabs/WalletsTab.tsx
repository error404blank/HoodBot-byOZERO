"use client";

import { useEffect, useState } from "react";

interface WalletRow {
  id: number;
  name: string;
  address: string;
  isActive: boolean;
  balanceEth?: string;
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function WalletsTab() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/v1/wallets")
      .then((r) => r.json())
      .then((d) => {
        const data = d as { wallets: WalletRow[] };
        setWallets(data.wallets ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function copyAddr(id: number, addr: string) {
    navigator.clipboard.writeText(addr);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-mono font-bold text-foreground">Wallets</h2>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">
            Wallet dikelola lewat bot Telegram. Gunakan /start di bot untuk membuat atau import wallet baru.
          </p>
        </div>
        <span className="text-xs font-mono text-muted-foreground border border-border rounded px-2 py-1">
          {wallets.length} wallet
        </span>
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      )}

      {!loading && wallets.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
          <p className="text-sm font-mono text-muted-foreground">Belum ada wallet.</p>
          <p className="text-xs font-mono text-muted-foreground/60 mt-1">
            Buat atau import wallet lewat bot Telegram: /start → Wallet
          </p>
        </div>
      )}

      {!loading && wallets.length > 0 && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
          {wallets.map((w) => (
            <div key={w.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-mono font-bold text-primary">
                  {w.name[0]?.toUpperCase() ?? "W"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-mono font-semibold text-foreground">{w.name}</span>
                  {w.isActive && (
                    <span className="text-[10px] font-mono text-primary border border-primary/20 bg-primary/10 rounded px-1.5 py-0.5 leading-none">
                      Active
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono text-muted-foreground">{shortAddr(w.address)}</span>
                {w.balanceEth && (
                  <span className="text-xs font-mono text-muted-foreground/60 ml-2">{w.balanceEth} ETH</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => copyAddr(w.id, w.address)}
                  className="text-xs font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                  title="Copy address"
                >
                  {copied === w.id ? "Copied" : "Copy"}
                </button>
                <a
                  href={`https://robinhoodchain.blockscout.com/address/${w.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
                >
                  Explorer
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-xs font-mono text-muted-foreground">
          <span className="text-primary font-semibold">Note:</span> Untuk keamanan, private key tidak pernah ditampilkan di web. Semua operasi signing dilakukan di server dengan PIN.
        </p>
      </div>
    </div>
  );
}
