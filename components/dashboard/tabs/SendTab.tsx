"use client";

import { useEffect, useState } from "react";
import { SUPPORTED_MINT_CHAINS } from "@/src/services/chain";
import { useLang } from "@/lib/useLang";

interface WalletRow {
  id: number;
  name: string;
  address: string;
  balanceEth?: string;
}

type TxStatus = "idle" | "simulating" | "sending" | "success" | "error";

export function SendTab() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [walletId, setWalletId] = useState("");
  const [chain, setChain] = useState("robinhood");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [status, setStatus] = useState<TxStatus>("idle");
  const [result, setResult] = useState<{ txHash?: string; error?: string; gasEstimate?: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/wallets")
      .then((r) => r.json())
      .then((d) => {
        const data = d as { wallets: WalletRow[] };
        setWallets(data.wallets ?? []);
        if (data.wallets?.[0]) setWalletId(String(data.wallets[0].id));
      });
  }, []);

  const { tr } = useLang();
  const selectedWallet = wallets.find((w) => String(w.id) === walletId);
  const selectedChain = SUPPORTED_MINT_CHAINS.find((c) => c.slug === chain) ?? SUPPORTED_MINT_CHAINS[1];

  async function handleSend() {
    if (!walletId || !toAddress || !amount) return;

    setStatus(dryRun ? "simulating" : "sending");
    setResult(null);

    const res = await fetch("/api/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletId: Number(walletId), chain, toAddress, amount, dryRun }),
    });
    const data = await res.json() as { txHash?: string; gasEstimate?: string; error?: string };

    if (data.error) {
      setStatus("error");
      setResult({ error: data.error });
    } else {
      setStatus("success");
      setResult(data);
    }
  }

  const explorerBase = selectedChain.explorer;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-xl">
      <div>
        <h2 className="text-base font-mono font-bold text-foreground">{tr.sendTitle}</h2>
        <p className="text-xs font-mono text-muted-foreground mt-0.5">Send ETH from a wallet to any address.</p>
      </div>

      {/* Network */}
      <div className="space-y-1.5">
        <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          {tr.network} <span className="text-destructive">*</span>
        </label>
        <select
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          className="w-full bg-card border border-border rounded px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
        >
          {SUPPORTED_MINT_CHAINS.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}{c.slug === "sepolia" ? " [TESTNET]" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* From wallet */}
      <div className="space-y-1.5">
        <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          From Wallet <span className="text-destructive">*</span>
        </label>
        <select
          value={walletId}
          onChange={(e) => setWalletId(e.target.value)}
          className="w-full bg-card border border-border rounded px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
        >
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} — {w.address.slice(0, 8)}...{w.address.slice(-4)}
              {w.balanceEth ? ` (${w.balanceEth} ETH)` : ""}
            </option>
          ))}
        </select>
        {selectedWallet && (
          <p className="text-xs font-mono text-muted-foreground/60 pl-1">{selectedWallet.address}</p>
        )}
      </div>

      {/* To address */}
      <div className="space-y-1.5">
        <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          To Address <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          placeholder="0x..."
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          className="w-full bg-card border border-border rounded px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          Amount {selectedChain.symbol} <span className="text-destructive">*</span>
        </label>
        <input
          type="number"
          placeholder="0.001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.0001"
          className="w-full bg-card border border-border rounded px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* Dry run toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => setDryRun(!dryRun)}
          className={`w-8 h-4 rounded-full transition-colors ${dryRun ? "bg-primary/60" : "bg-muted"} relative`}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-foreground transition-transform ${dryRun ? "translate-x-0.5" : "translate-x-4"}`} />
        </div>
        <span className="text-sm font-mono text-muted-foreground">Dry Run (simulasi saja)</span>
      </label>

      {/* Submit */}
      <button
        onClick={handleSend}
        disabled={status === "simulating" || status === "sending" || !walletId || !toAddress || !amount}
        className="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-mono font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {status === "simulating" ? "Simulating..." :
         status === "sending" ? "Sending..." :
         dryRun ? "Simulate Send" : "Send ETH"}
      </button>

      {/* Result */}
      {result && (
        <div className={`rounded border px-4 py-3 space-y-1 ${result.error ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
          {result.error ? (
            <p className="text-xs font-mono text-destructive">{result.error}</p>
          ) : (
            <>
              {result.gasEstimate && (
                <p className="text-xs font-mono text-muted-foreground">Gas estimate: {result.gasEstimate}</p>
              )}
              {result.txHash && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-primary font-semibold">Tx confirmed</span>
                  <a
                    href={`${explorerBase}/tx/${result.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-primary hover:underline"
                  >
                    {result.txHash.slice(0, 12)}...{result.txHash.slice(-8)}
                  </a>
                </div>
              )}
              {dryRun && !result.txHash && (
                <p className="text-xs font-mono text-primary">Simulation successful. Disable Dry Run to send.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
