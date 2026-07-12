"use client";

import { useState } from "react";

// ─── Types matching nft.ts NftContractInfo ────────────────────────────────────
type MintPhase = "unknown" | "paused" | "allowlist" | "public" | "soldout";

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
  allowlist: "Allowlist",
  public: "Public — LIVE",
  soldout: "Sold Out",
};

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function MintPanel({ apiKey }: { apiKey: string }) {
  const [contractAddress, setContractAddress] = useState("");
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  const [telegramId, setTelegramId] = useState("");
  const [walletId, setWalletId] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [pin, setPin] = useState("");
  const [quantity, setQuantity] = useState(1);

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState("");

  async function callApi(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/v1/nft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
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
    if (!walletAddress || !contractInfo) return;
    setStatus("loading");
    setMessage("Simulating transaction...");
    setSimResult(null);
    try {
      const data = await callApi("simulate", { quantity, walletAddress });
      setSimResult(data);
      setStatus("idle");
      setMessage("");
    } catch {
      setStatus("error");
      setMessage("Network error");
    }
  }

  async function handleMint() {
    if (!telegramId || !walletId || !pin) return;
    setStatus("loading");
    setMessage("Submitting mint transaction...");
    setTxHash("");
    try {
      const data = await callApi("mint", {
        telegramId,
        walletId: Number(walletId),
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
      }
    } catch {
      setStatus("error");
      setMessage("Network error");
    }
  }

  const canMint = contractInfo?.hasCode && contractInfo.phase !== "soldout";

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          NFT Minter
        </h3>
        <span className="text-xs font-mono text-muted-foreground/60">
          Uniswap V3 · Robinhood Chain
        </span>
      </div>

      <div className="p-4 flex flex-col gap-5">
        {/* Step 1 — Contract */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            1. Contract Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="0x..."
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
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
                <span className="ml-2 text-muted-foreground font-normal">({contractInfo.symbol})</span>
              </span>
              <span className={`text-xs font-mono font-semibold ${PHASE_COLORS[contractInfo.phase]}`}>
                {PHASE_LABELS[contractInfo.phase]}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
              <InfoRow label="Standard" value={contractInfo.standard} />
              <InfoRow
                label="Supply"
                value={
                  contractInfo.maxSupply !== "0"
                    ? `${contractInfo.totalSupply} / ${contractInfo.maxSupply}`
                    : `${contractInfo.totalSupply} minted`
                }
              />
              <InfoRow
                label="Price"
                value={
                  contractInfo.mintPriceWei === "0"
                    ? "Free"
                    : `${parseFloat(contractInfo.mintPrice).toFixed(6)} ETH`
                }
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

        {/* Step 2 — Quantity + wallet */}
        {contractInfo && canMint && (
          <div className="flex flex-col gap-3">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              2. Mint Config
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono text-muted-foreground">Quantity</span>
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

            {/* Wallet address for simulate */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-mono text-muted-foreground">Wallet Address (for simulation)</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="0x... (for dry-run)"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60"
                />
                <button
                  onClick={handleSimulate}
                  disabled={status === "loading" || walletAddress.length < 10}
                  className="px-4 py-2 text-xs font-mono rounded-md bg-muted/60 border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Dry-run
                </button>
              </div>
            </div>

            {/* Simulate result */}
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
                  : `Simulation failed (${simResult.errorType}): ${simResult.errorMessage}`}
              </div>
            )}
          </div>
        )}

        {/* Step 3 — Auth + execute */}
        {contractInfo && canMint && (
          <div className="flex flex-col gap-3">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              3. Execute Mint
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono text-muted-foreground">Telegram ID</span>
                <input
                  type="text"
                  placeholder="12345678"
                  value={telegramId}
                  onChange={(e) => setTelegramId(e.target.value)}
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono text-muted-foreground">Wallet ID</span>
                <input
                  type="text"
                  placeholder="1"
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                  className="bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-mono text-muted-foreground">PIN (6 digits)</span>
              <input
                type="password"
                placeholder="••••••"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60"
              />
            </div>
            <button
              onClick={handleMint}
              disabled={status === "loading" || !telegramId || !walletId || pin.length !== 6}
              className="w-full py-2.5 text-sm font-mono font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "Minting..." : `Mint ${quantity}x NFT`}
            </button>
          </div>
        )}

        {/* Status messages */}
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
                TX: {shortAddr(txHash)}
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
