"use client";

import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type MintPhase = "unknown" | "paused" | "allowlist" | "public" | "soldout";

interface WalletOption {
  id: number;
  name: string;
  address: string;
  isActive: boolean;
  ethBalance: string;
}

interface ContractInfo {
  address: string;
  standard: string;
  name: string;
  symbol: string;
  totalSupply: string;
  maxSupply: string;
  mintPrice: string;
  mintPriceWei: string;
  isLive: boolean;
  hasCode: boolean;
  phase: MintPhase;
  remaining: string;
}

interface SimResult {
  success: boolean;
  gasEstimate: string;
  errorMessage?: string;
  errorType?: string;
}

const PHASE_COLORS: Record<MintPhase, string> = {
  unknown: "text-muted-foreground",
  paused: "text-yellow-500",
  allowlist: "text-accent",
  public: "text-primary",
  soldout: "text-destructive",
};

const PHASE_LABELS: Record<MintPhase, string> = {
  unknown: "Unknown",
  paused: "Paused",
  allowlist: "Allowlist Only",
  public: "Public — LIVE",
  soldout: "Sold Out",
};

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function MintPanel() {
  // ── Wallets from DB ──────────────────────────────────────────────────────────
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [selectedWalletId, setSelectedWalletId] = useState<number | "">("");

  // ── Contract state ──────────────────────────────────────────────────────────
  const [contractAddress, setContractAddress] = useState("");
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  // ── Mint params ──────────────────────────────────────────────────────────────
  const [pin, setPin] = useState("");
  const [quantity, setQuantity] = useState(1);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState("");

  // ── Load wallets on mount ────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/v1/wallets")
      .then((r) => r.json())
      .then((d) => {
        const list: WalletOption[] = d.wallets ?? [];
        setWallets(list);
        // Auto-select the active wallet
        const active = list.find((w) => w.isActive) ?? list[0];
        if (active) setSelectedWalletId(active.id);
      })
      .catch(() => {})
      .finally(() => setWalletsLoading(false));
  }, []);

  const selectedWallet = wallets.find((w) => w.id === selectedWalletId) ?? null;

  async function callApi(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/v1/nft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, contractAddress, ...extra }),
    });
    return res.json();
  }

  async function handleDetect() {
    if (!contractAddress.startsWith("0x")) return;
    setStatus("loading");
    setMessage("Detecting contract...");
    setContractInfo(null);
    setSimResult(null);
    try {
      const data = await callApi("detect");
      if (data.error) {
        setStatus("error");
        setMessage(data.error);
      } else {
        setContractInfo(data);
        setStatus("idle");
        setMessage("");
      }
    } catch {
      setStatus("error");
      setMessage("Network error");
    }
  }

  async function handleSimulate() {
    if (!selectedWallet || !contractInfo) return;
    setStatus("loading");
    setMessage("Simulating transaction...");
    setSimResult(null);
    try {
      const data = await callApi("simulate", {
        quantity,
        walletAddress: selectedWallet.address,
      });
      setSimResult(data);
      setStatus("idle");
      setMessage("");
    } catch {
      setStatus("error");
      setMessage("Network error");
    }
  }

  async function handleMint() {
    if (!selectedWallet || pin.length !== 6) return;
    setStatus("loading");
    setMessage("Submitting mint transaction...");
    setTxHash("");
    try {
      const data = await callApi("mint", {
        walletId: selectedWallet.id,
        pin,
        quantity,
      });
      if (data.error) {
        setStatus("error");
        setMessage(data.error);
      } else {
        setStatus("success");
        setTxHash(data.txHash);
        setMessage(`Minted ${quantity}x successfully!`);
        setPin("");
      }
    } catch {
      setStatus("error");
      setMessage("Network error");
    }
  }

  const canMint = contractInfo?.hasCode && contractInfo.phase !== "soldout" && contractInfo.phase !== "paused";

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          NFT Minter — Web Interface
        </h3>
        <span className="text-xs font-mono text-muted-foreground/50">
          Synced with Telegram Bot
        </span>
      </div>

      <div className="p-4 flex flex-col gap-5">

        {/* Step 1 — Wallet selector (auto-loaded from DB) */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            1. Select Wallet
          </label>
          {walletsLoading ? (
            <div className="text-xs font-mono text-muted-foreground animate-pulse">Loading wallets from bot...</div>
          ) : wallets.length === 0 ? (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5">
              <p className="text-xs font-mono text-yellow-400/90">
                No wallets found. Create a wallet via the Telegram bot first using <code>/start → Create Wallet</code>.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <select
                value={selectedWalletId}
                onChange={(e) => setSelectedWalletId(Number(e.target.value))}
                className="bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/60"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {shortAddr(w.address)} {w.isActive ? "(Active)" : ""}
                  </option>
                ))}
              </select>
              {selectedWallet && (
                <div className="flex items-center justify-between px-3 py-2 rounded-md bg-background/60 border border-border/50">
                  <span className="text-xs font-mono text-muted-foreground break-all">{selectedWallet.address}</span>
                  <span className="text-xs font-mono text-primary shrink-0 ml-3">
                    {parseFloat(selectedWallet.ethBalance).toFixed(6)} ETH
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2 — Contract */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            2. NFT Contract Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="0x..."
              value={contractAddress}
              onChange={(e) => { setContractAddress(e.target.value); setContractInfo(null); setSimResult(null); }}
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60"
            />
            <button
              onClick={handleDetect}
              disabled={status === "loading" || contractAddress.length < 10}
              className="px-4 py-2 text-xs font-mono rounded-md bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Detect
            </button>
          </div>
        </div>

        {/* Contract info card */}
        {contractInfo && (
          <div className="rounded-md border border-border bg-background/60 p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono font-semibold text-foreground">
                {contractInfo.name}
                <span className="ml-2 text-muted-foreground font-normal text-xs">({contractInfo.symbol})</span>
              </span>
              <span className={`text-xs font-mono font-semibold ${PHASE_COLORS[contractInfo.phase]}`}>
                {PHASE_LABELS[contractInfo.phase]}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
              <InfoRow label="Standard" value={contractInfo.standard} />
              <InfoRow
                label="Supply"
                value={contractInfo.maxSupply !== "0"
                  ? `${contractInfo.totalSupply} / ${contractInfo.maxSupply}`
                  : `${contractInfo.totalSupply} minted`}
              />
              <InfoRow
                label="Price"
                value={contractInfo.mintPriceWei === "0"
                  ? "Free"
                  : `${parseFloat(contractInfo.mintPrice).toFixed(6)} ETH`}
              />
              <InfoRow
                label="Remaining"
                value={contractInfo.remaining === "unknown" ? "N/A" : contractInfo.remaining}
              />
            </div>
            <a
              href={`https://robinhoodchain.blockscout.com/address/${contractInfo.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-primary/70 hover:text-primary mt-1"
            >
              {shortAddr(contractInfo.address)} — View on Explorer
            </a>
          </div>
        )}

        {/* Step 3 — Quantity + Simulate */}
        {contractInfo && canMint && (
          <div className="flex flex-col gap-3">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              3. Quantity
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono text-muted-foreground">Amount</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value))))}
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/60"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono text-muted-foreground">Total cost</span>
                <div className="bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-primary">
                  {contractInfo.mintPriceWei === "0"
                    ? "Free"
                    : `${((Number(contractInfo.mintPriceWei) * quantity) / 1e18).toFixed(6)} ETH`}
                </div>
              </div>
            </div>

            <button
              onClick={handleSimulate}
              disabled={status === "loading" || !selectedWallet}
              className="px-4 py-2 text-xs font-mono rounded-md bg-muted/60 border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-fit"
            >
              {status === "loading" ? "Simulating..." : "Dry-run Simulation"}
            </button>

            {simResult && (
              <div
                className={`rounded-md px-3 py-2 text-xs font-mono border ${
                  simResult.success
                    ? "bg-primary/5 border-primary/20 text-primary"
                    : "bg-destructive/5 border-destructive/20 text-destructive"
                }`}
              >
                {simResult.success
                  ? `Simulation passed — gas estimate: ${Number(simResult.gasEstimate).toLocaleString()} units`
                  : `${simResult.errorMessage ?? "Simulation failed"}`}
              </div>
            )}
          </div>
        )}

        {/* Step 4 — PIN + Mint */}
        {contractInfo && canMint && (
          <div className="flex flex-col gap-3">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              4. Enter PIN &amp; Mint
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="6-digit PIN"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="w-40 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 tracking-widest"
              />
              <button
                onClick={handleMint}
                disabled={status === "loading" || !selectedWallet || pin.length !== 6}
                className="flex-1 py-2.5 text-sm font-mono font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status === "loading" ? "Minting..." : `Mint ${quantity}x`}
              </button>
            </div>
            <p className="text-xs font-mono text-muted-foreground/60">
              Same PIN you set when creating the wallet in the Telegram bot.
            </p>
          </div>
        )}

        {/* Paused / soldout notice */}
        {contractInfo && !canMint && contractInfo.hasCode && (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5">
            <p className="text-xs font-mono text-yellow-400/90">
              Minting is currently {PHASE_LABELS[contractInfo.phase].toLowerCase()} for this contract.
            </p>
          </div>
        )}

        {/* Status / result */}
        {message && (
          <div
            className={`rounded-md px-3 py-2 text-xs font-mono border ${
              status === "success"
                ? "bg-primary/5 border-primary/20 text-primary"
                : status === "error"
                ? "bg-destructive/5 border-destructive/20 text-destructive"
                : "bg-muted/40 border-border text-muted-foreground"
            }`}
          >
            {message}
            {txHash && (
              <a
                href={`https://robinhoodchain.blockscout.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block mt-1 text-primary hover:underline"
              >
                TX: {shortAddr(txHash)} — View on Explorer
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-mono text-muted-foreground/60">{label}</span>
      <span className="text-xs font-mono text-foreground">{value}</span>
    </div>
  );
}
