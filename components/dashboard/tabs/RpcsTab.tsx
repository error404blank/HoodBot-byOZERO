"use client";

import { useEffect, useState } from "react";
import { SUPPORTED_MINT_CHAINS } from "@/src/services/chain";

interface RpcRow {
  id: number;
  chainId: number;
  chainName: string;
  name: string;
  url: string;
  isDefault: boolean;
}

const CHAIN_OPTIONS = SUPPORTED_MINT_CHAINS.map((c) => ({
  id: c.id,
  name: c.name,
  defaultUrl: c.defaultRpc,
}));

export function RpcsTab() {
  const [rpcs, setRpcs] = useState<RpcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Form state
  const [chainId, setChainId] = useState(CHAIN_OPTIONS[0].id);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadRpcs() {
    const r = await fetch("/api/v1/rpcs");
    const d = await r.json() as { rpcs: RpcRow[] };
    setRpcs(d.rpcs ?? []);
    setLoading(false);
  }

  useEffect(() => { loadRpcs(); }, []);

  async function handleAdd() {
    if (!name || !url) return;
    setSaving(true);
    setError("");
    const chain = CHAIN_OPTIONS.find((c) => c.id === chainId);
    const r = await fetch("/api/v1/rpcs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainId, chainName: chain?.name ?? "", name, url, isDefault }),
    });
    const d = await r.json() as { error?: string };
    if (d.error) { setError(d.error); setSaving(false); return; }
    setSaving(false);
    setAdding(false);
    setName(""); setUrl(""); setIsDefault(false);
    loadRpcs();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/v1/rpcs/${id}`, { method: "DELETE" });
    loadRpcs();
  }

  async function handleSetDefault(id: number) {
    await fetch(`/api/v1/rpcs/${id}/default`, { method: "POST" });
    loadRpcs();
  }

  const grouped = CHAIN_OPTIONS.map((c) => ({
    ...c,
    items: rpcs.filter((r) => r.chainId === c.id),
  }));

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-mono font-bold text-foreground">RPCs</h2>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">Custom RPC per chain. RPC default dipakai saat transaksi.</p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs font-mono px-3 py-1.5 rounded bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-colors"
        >
          {adding ? "Batal" : "+ Tambah RPC"}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">RPC Baru</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">Chain</label>
              <select
                value={chainId}
                onChange={(e) => {
                  const id = Number(e.target.value) as 1 | 4663 | 8453;
                  setChainId(id);
                  const c = CHAIN_OPTIONS.find((x) => x.id === id);
                  if (c) setUrl(c.defaultUrl);
                }}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
              >
                {CHAIN_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-mono text-muted-foreground">Nama RPC</label>
              <input
                placeholder="e.g. Llamarpc"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground">URL</label>
            <input
              placeholder="https://rpc.example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="accent-primary" />
            <span className="text-sm font-mono text-muted-foreground">Jadikan default untuk chain ini</span>
          </label>
          {error && <p className="text-xs font-mono text-destructive">{error}</p>}
          <button
            onClick={handleAdd}
            disabled={saving || !name || !url}
            className="w-full py-2.5 rounded bg-primary text-primary-foreground text-sm font-mono font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            {saving ? "Menyimpan..." : "Simpan RPC"}
          </button>
        </div>
      )}

      {/* RPC list grouped by chain */}
      {loading && (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-14 rounded-lg border border-border bg-card animate-pulse" />)}
        </div>
      )}

      {!loading && grouped.map((group) => (
        <div key={group.id} className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground px-1">{group.name}</p>
          {group.items.length === 0 ? (
            <div className="rounded-lg border border-border/50 bg-card/50 px-4 py-3">
              <p className="text-xs font-mono text-muted-foreground/50">Tidak ada custom RPC — menggunakan default.</p>
              <p className="text-[11px] font-mono text-muted-foreground/40 mt-0.5 break-all">{group.defaultUrl}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
              {group.items.map((rpc) => (
                <div key={rpc.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono text-foreground">{rpc.name}</span>
                      {rpc.isDefault && (
                        <span className="text-[10px] font-mono text-primary border border-primary/20 bg-primary/10 rounded px-1.5 py-0.5 leading-none">Default</span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground/60 truncate">{rpc.url}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!rpc.isDefault && (
                      <button
                        onClick={() => handleSetDefault(rpc.id)}
                        className="text-[11px] font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(rpc.id)}
                      className="text-[11px] font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
