"use client";

import { useEffect, useState } from "react";
import { SUPPORTED_MINT_CHAINS } from "@/src/services/chain";
import { useLang } from "@/lib/useLang";

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
const BUSY_STATUSES: MintStatus[] = ["detecting", "simulating", "minting"];

export function NftHoodTab() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [history, setHistory] = useState<MintHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Form
  const [chain, setChain] = useState("robinhood");
  const [walletId, setWalletId] = useState("");
  const [contract, setContract] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [dryRun, setDryRun] = useState(true);
  const [gasPreset, setGasPreset] = useState<"low" | "medium" | "high" | "custom">("medium");
  const [customMaxFee, setCustomMaxFee] = useState("");
  const [customPriorityFee, setCustomPriorityFee] = useState("");
  const [sniperMode, setSniperMode] = useState(false);
  const [sniperTimeout, setSniperTimeout] = useState(60);
  const { tr } = useLang();

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

    const selectedWalletObj = wallets.find((w) => String(w.id) === walletId);
    const walletAddress = selectedWalletObj?.address ?? "";

    if (dryRun) {
      // Step 1 of dry-run: detect contract info
      setStatus("detecting");
      setResult(null);
      const detectRes = await fetch("/api/v1/nft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect", contractAddress: contract, chainSlug: chain }),
      });
      const detectData = await detectRes.json() as { name?: string; mintPrice?: string; phase?: string; error?: string };
      if (detectData.error) {
        setStatus("error");
        setResult({ error: detectData.error });
        return;
      }

      // Step 2: simulate (gas estimate)
      setStatus("simulating");
      const simRes = await fetch("/api/v1/nft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          contractAddress: contract,
          chainSlug: chain,
          quantity,
          walletAddress,
        }),
      });
      const simData = await simRes.json() as { success?: boolean; gasEstimate?: string; errorMessage?: string };
      if (simData.success === false) {
        setStatus("error");
        setResult({ error: simData.errorMessage ?? "Simulation failed" });
      } else {
        setStatus("success");
        setResult({ gasEstimate: simData.gasEstimate, contractName: detectData.name });
      }
      return;
    }

    // Live mint
    setStatus("minting");
    setResult(null);
    const res = await fetch("/api/v1/nft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mint",
        contractAddress: contract,
        chainSlug: chain,
        walletId: Number(walletId),
        quantity,
        gasPreset,
        ...(gasPreset === "custom" && customMaxFee ? {
          maxFeePerGasGwei: Number(customMaxFee),
          maxPriorityFeePerGasGwei: Number(customPriorityFee || "1"),
        } : {}),
        sniperMode: sniperMode,
        sniperTimeoutMs: sniperTimeout * 1000,
      }),
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
        <p className="text-xs font-mono text-muted-foreground mt-0.5">Mint NFT on Ethereum, Robinhood Chain, Base, or Sepolia (testnet).</p>
      </div>

      {/* Mint form */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{tr.mint} NFT</p>

        {/* Network */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground">
            {tr.network} <span className="text-destructive">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_MINT_CHAINS.map((c) => {
              const isTestnet = c.slug === "sepolia";
              return (
                <button
                  key={c.slug}
                  onClick={() => setChain(c.slug)}
                  className={`py-2 px-2 rounded border text-xs font-mono transition-colors text-center relative ${
                    chain === c.slug
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  <span>{c.name}</span>
                  {isTestnet && (
                    <span className="ml-1.5 text-[9px] font-mono border border-yellow-500/40 text-yellow-400 bg-yellow-500/10 rounded px-1 py-0.5 align-middle">
                      TEST
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Wallet */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground">
            {tr.selectWallet} <span className="text-destructive">*</span>
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
            {tr.contractAddress} <span className="text-destructive">*</span>
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
          <label className="text-xs font-mono text-muted-foreground">{tr.quantity}</label>
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

        {/* Gas preset */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Gas Speed</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(["low", "medium", "high", "custom"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setGasPreset(p)}
                className={`py-1.5 rounded border text-[11px] font-mono transition-colors ${
                  gasPreset === p
                    ? p === "high"
                      ? "border-orange-400/60 bg-orange-400/10 text-orange-400"
                      : "border-primary/50 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                {p === "low" ? "Low" : p === "medium" ? "Med" : p === "high" ? "High" : "Custom"}
              </button>
            ))}
          </div>
          <p className="text-[10px] font-mono text-muted-foreground/60">
            {gasPreset === "low" && "Exact estimate — may fail on congested chains."}
            {gasPreset === "medium" && "+20% buffer — recommended for most chains."}
            {gasPreset === "high" && "+50% buffer — fast confirmation."}
            {gasPreset === "custom" && "Set exact Max Fee and Priority Fee below."}
          </p>
          {gasPreset === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground">Max Fee (Gwei)</label>
                <input
                  type="number" min="0" step="0.01" placeholder="e.g. 20"
                  value={customMaxFee} onChange={(e) => setCustomMaxFee(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2.5 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground">Priority Fee (Gwei)</label>
                <input
                  type="number" min="0" step="0.01" placeholder="e.g. 1.5"
                  value={customPriorityFee} onChange={(e) => setCustomPriorityFee(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2.5 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
          )}
        </div>

        {/* Sniper Mode — only for live mint */}
        {!dryRun && (
          <div className="rounded border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setSniperMode(!sniperMode)}
                className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer shrink-0 ${sniperMode ? "bg-yellow-400/70" : "bg-muted"}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-foreground transition-transform ${sniperMode ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <div>
                <p className="text-xs font-mono text-foreground font-semibold">Sniper Mode</p>
                <p className="text-[10px] font-mono text-muted-foreground">Keep retrying mint until success or timeout</p>
              </div>
            </label>
            {sniperMode && (
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground">Timeout (seconds)</label>
                <input
                  type="number" min="10" max="300" step="5"
                  value={sniperTimeout} onChange={(e) => setSniperTimeout(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded px-2.5 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            )}
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
          disabled={BUSY_STATUSES.includes(status) || !walletId || !contract}
          className="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-mono font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === "detecting" ? "Detecting contract..." :
           status === "simulating" ? "Simulating..." :
           status === "minting" ? "Minting..." :
           dryRun ? `Simulate on ${selectedChain.name}` : `Mint on ${selectedChain.name}`}
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
                  <p className="text-xs font-mono text-primary">Simulation successful. Disable Dry Run to execute real mint.</p>
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
                    href={`${selectedChain.explorer}/tx/${m.txHash}`}
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
