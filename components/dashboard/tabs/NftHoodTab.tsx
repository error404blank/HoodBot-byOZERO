"use client";

import { useEffect, useState } from "react";
import { SUPPORTED_MINT_CHAINS } from "@/src/services/chain";

interface WalletRow {
  id: number;
  name: string;
  address: string;
}

interface MintHistory {
  id: number;
  contractAddress: string;
  quantity: number;
  txHash: string | null;
  mintedAt: string;
}

type MintStatus = "idle" | "detecting" | "simulating" | "minting" | "success" | "error";

export function NftHoodTab() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [history, setHistory] = useState<MintHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Form
  const [chain, setChain] = useState("robinhood");
  const [walletId, setWalletId] = useState("");
  const [contract, setContract] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [pin, setPin] = useState("");
  const [dryRun, setDryRun] = useState(true);

  const [status, setStatus] = useState<MintStatus>("idle");
  const [result, setResult] = useState<{
    txHash?: string;
    gasEstimate?: string;
    contractName?: string;
    error?: string;
  } | null>(null);

  const selectedChain = SUPPORTED_MINT_CHAINS.find((c) => c.slug === chain) ?? SUPPORTED_MINT_CHAINS[1];

  useEffect(() => {
    fetch("/api/v1/wallets")
      .then((r) => r.json())
      .then((d) => {
        const data = d as { wallets: WalletRow[] };
        setWallets(data.wallets ?? []);
        if (data.wallets?.[0]) setWalletId(String(data.wallets[0].id));
      });
    fetch("/api/v1/nft-history")
      .then((r) => r.json())
      .then((d) => {
        const data = d as { mints: MintHistory[] };
        setHistory(data.mints ?? []);
        setLoadingHistory(false);
      })
      .catch(() => setLoadingHistory(false));
  }, []);

  async function handleMint() {
    if (!walletId || !contract) return;
    if (!dryRun && !pin) return;

    setStatus(dryRun ? "simulating" : "minting");
    setResult(null);

    const res = await fetch("/api/v1/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletId: Number(walletId), chain, contract, quantity, pin, dryRun }),
    });
    const data = await res.json() as {
      txHash?: string;
      gasEstimate?: string;
      contractName?: string;
      error?: string;
    };

    if (data.error) {
      setStatus("error");
    } else {
      setStatus("success");
      // Refresh history
      fetch("/api/v1/nft-history")
        .then((r) => r.json())
        .then((d) => { const x = d as { mints: MintHistory[] }; setHistory(x.mints ?? []); });
    }
    setResult(data);
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-mono font-bold text-foreground">NFTHood</h2>
        <p className="text-xs font-mono text-muted-foreground mt-0.5">Mint NFT di Ethereum, Robinhood Chain, atau Base.</p>
      </div>

      {/* Mint form */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Mint NFT</p>

        {/* Network */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground">
            Network <span className="text-destructive">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {SUPPORTED_MINT_CHAINS.map((c) => (
              <button
                key={c.slug}
                onClick={() => setChain(c.slug)}
                className={`py-2 px-2 rounded border text-xs font-mono transition-colors text-center ${
                  chain === c.slug
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Wallet */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground">
            Wallet <span className="text-destructive">*</span>
          </label>
          <select
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} — {w.address.slice(0, 8)}...{w.address.slice(-4)}
              </option>
            ))}
          </select>
        </div>

        {/* Contract */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground">
            Contract Address <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
          />
        </div>

        {/* Quantity */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground">Quantity</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-9 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 font-mono text-lg transition-colors"
            >
              -
            </button>
            <input
              type="number"
              min={1}
              max={20}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value))))}
              className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground text-center focus:outline-none focus:border-primary/50"
            />
            <button
              onClick={() => setQuantity(Math.min(20, quantity + 1))}
              className="w-8 h-9 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 font-mono text-lg transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* PIN — only for live mint */}
        {!dryRun && (
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-muted-foreground">
              PIN Wallet <span className="text-destructive">*</span>
            </label>
            <input
              type="password"
              placeholder="6 digit PIN"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
            />
          </div>
        )}

        {/* Dry run toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => setDryRun(!dryRun)}
            className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${dryRun ? "bg-primary/60" : "bg-muted"}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-foreground transition-transform ${dryRun ? "translate-x-0.5" : "translate-x-4"}`} />
          </div>
          <span className="text-sm font-mono text-muted-foreground">Dry Run (simulasi saja)</span>
        </label>

        {/* Submit */}
        <button
          onClick={handleMint}
          disabled={status === "simulating" || status === "minting" || !walletId || !contract || (!dryRun && !pin)}
          className="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-mono font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === "simulating" ? "Simulating..." :
           status === "minting" ? "Minting..." :
           dryRun ? `Simulate Mint on ${selectedChain.name}` : `Mint on ${selectedChain.name}`}
        </button>

        {/* Result */}
        {result && (
          <div className={`rounded border px-4 py-3 space-y-1 ${result.error ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
            {result.error ? (
              <p className="text-xs font-mono text-destructive">{result.error}</p>
            ) : (
              <>
                {result.contractName && (
                  <p className="text-xs font-mono text-muted-foreground">Collection: {result.contractName}</p>
                )}
                {result.gasEstimate && (
                  <p className="text-xs font-mono text-muted-foreground">Gas estimate: {result.gasEstimate}</p>
                )}
                {result.txHash && (
                  <a
                    href={`${selectedChain.explorer}/tx/${result.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-primary hover:underline block"
                  >
                    Tx: {result.txHash.slice(0, 14)}...{result.txHash.slice(-8)}
                  </a>
                )}
                {dryRun && !result.txHash && (
                  <p className="text-xs font-mono text-primary">Simulasi berhasil. Matikan Dry Run untuk mint sungguhan.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Mint history */}
      <div className="space-y-2">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground px-1">Riwayat Mint</p>

        {loadingHistory && (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 rounded-lg border border-border bg-card animate-pulse" />)}
          </div>
        )}

        {!loadingHistory && history.length === 0 && (
          <div className="rounded-lg border border-border/50 bg-card/50 px-4 py-5 text-center">
            <p className="text-xs font-mono text-muted-foreground/60">Belum ada mint.</p>
          </div>
        )}

        {!loadingHistory && history.length > 0 && (
          <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
            {history.map((m) => (
              <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-foreground truncate">
                    {m.contractAddress.slice(0, 10)}...{m.contractAddress.slice(-6)}
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground/60 mt-0.5">
                    qty: {m.quantity} · {new Date(m.mintedAt).toLocaleDateString("id-ID")}
                  </p>
                </div>
                {m.txHash && (
                  <a
                    href={`https://robinhoodchain.blockscout.com/tx/${m.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-primary hover:underline shrink-0"
                  >
                    Tx
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
