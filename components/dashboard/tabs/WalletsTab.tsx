"use client";

import { useEffect, useState, useRef } from "react";
import { useLang } from "@/lib/useLang";

interface WalletRow {
  id: number;
  name: string;
  address: string;
  isActive: boolean;
  ethBalance?: string;
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function WalletsTab() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { tr } = useLang();

  function loadWallets() {
    fetch("/api/v1/wallets")
      .then((r) => r.json())
      .then((d) => {
        const data = d as { wallets: WalletRow[] };
        setWallets(data.wallets ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadWallets(); }, []);

  function copyAddr(id: number, addr: string) {
    navigator.clipboard.writeText(addr);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  function startEdit(w: WalletRow) {
    setEditingId(w.id);
    setEditName(w.name);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(id: number) {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/wallets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId: id, name: trimmed }),
      });
      if (res.ok) {
        setWallets((prev) => prev.map((w) => w.id === id ? { ...w, name: trimmed } : w));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-mono font-bold text-foreground">{tr.walletsTitle}</h2>
          <p className="text-xs font-mono text-muted-foreground mt-0.5 leading-relaxed">
            {tr.walletsDesc}
          </p>
        </div>
        <span className="shrink-0 text-xs font-mono text-muted-foreground border border-border rounded px-2 py-1">
          {wallets.length}
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
          <p className="text-sm font-mono text-muted-foreground">{tr.noWallets}</p>
          <p className="text-xs font-mono text-muted-foreground/60 mt-1">{tr.noWalletsHint}</p>
        </div>
      )}

      {!loading && wallets.length > 0 && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
          {wallets.map((w, idx) => (
            <div key={w.id} className="px-4 py-3 space-y-2">
              {/* Top row: avatar + name + badges */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-mono font-bold text-primary">
                    {w.name[0]?.toUpperCase() ?? "W"}
                  </span>
                </div>

                {editingId === w.id ? (
                  /* Inline edit row */
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <input
                      ref={inputRef}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) saveEdit(w.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      maxLength={32}
                      className="flex-1 min-w-0 bg-background border border-primary/40 rounded px-2 py-1 text-sm font-mono text-foreground outline-none focus:border-primary transition-colors"
                      aria-label="Wallet name"
                    />
                    <button
                      onClick={() => saveEdit(w.id)}
                      disabled={saving || !editName.trim()}
                      className="shrink-0 text-[11px] font-mono px-2.5 py-1 rounded bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 disabled:opacity-40 transition-colors"
                    >
                      {saving ? "..." : tr.saveName}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="shrink-0 text-[11px] font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {tr.cancelEdit}
                    </button>
                  </div>
                ) : (
                  /* Display row */
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-semibold text-foreground">{w.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/50">#{idx + 1}</span>
                      {w.isActive && (
                        <span className="text-[10px] font-mono text-primary border border-primary/20 bg-primary/10 rounded px-1.5 py-0.5 leading-none">
                          {tr.activeLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono text-muted-foreground">{shortAddr(w.address)}</span>
                      {w.ethBalance && (
                        <span className="text-xs font-mono text-muted-foreground/50">{parseFloat(w.ethBalance).toFixed(4)} ETH</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons row */}
              {editingId !== w.id && (
                <div className="flex items-center gap-1.5 pl-11">
                  <button
                    onClick={() => startEdit(w)}
                    className="text-[11px] font-mono px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                  >
                    {tr.editName}
                  </button>
                  <button
                    onClick={() => copyAddr(w.id, w.address)}
                    className="text-[11px] font-mono px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                  >
                    {copied === w.id ? tr.copied : tr.copy}
                  </button>
                  <a
                    href={`https://robinhoodchain.blockscout.com/address/${w.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
                  >
                    {tr.explorer}
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-xs font-mono text-muted-foreground leading-relaxed">
          <span className="text-primary font-semibold">Note:</span> {tr.walletNote}
        </p>
        <p className="text-xs font-mono text-muted-foreground/60 mt-1">
          Bot: <span className="text-primary/70">/renamewallet &lt;index&gt; &lt;name&gt;</span>
        </p>
      </div>
    </div>
  );
}
