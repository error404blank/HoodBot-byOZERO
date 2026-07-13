"use client";

import { useEffect, useState, useCallback } from "react";
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

interface MintFnInfo {
  name: string;
  signature: string;
  payable: boolean;
  inputs: Array<{ type: string; name?: string }>;
  requiresProof?: boolean;
  mintType?: "open" | "signature" | "merkle" | "token-gated";
}

interface ContractCard {
  name: string;
  symbol: string;
  standard: string;
  totalSupply: string;
  maxSupply: string;
  mintPrice: string;
  phase: string;
  remaining: string;
  detectedChain: string;
  hasCode: boolean;
  mintFunctions: MintFnInfo[];
  abiSource: "explorer" | "fallback";
}

type DetectStatus = "idle" | "detecting" | "done" | "error";
type MintStatus   = "idle" | "simulating" | "minting" | "success" | "error";
const BUSY: MintStatus[] = ["simulating", "minting"];

const PHASE_COLOR: Record<string, string> = {
  public:    "text-primary",
  paused:    "text-yellow-400",
  soldout:   "text-destructive",
  allowlist: "text-blue-400",
  unknown:   "text-muted-foreground",
};

export function NftHoodTab() {
  const [wallets, setWallets]           = useState<WalletRow[]>([]);
  const [history, setHistory]           = useState<MintHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const { tr } = useLang();

  // Contract info card
  const [contract, setContract]         = useState("");
  const [detectStatus, setDetectStatus] = useState<DetectStatus>("idle");
  const [contractCard, setContractCard] = useState<ContractCard | null>(null);
  const [detectError, setDetectError]   = useState("");

  // Form
  const [chain, setChain]               = useState("robinhood");
  const [walletId, setWalletId]         = useState("");
  const [quantity, setQuantity]         = useState(1);
  const [dryRun, setDryRun]             = useState(true);
  const [gasPreset, setGasPreset]       = useState<"low" | "medium" | "high" | "custom">("medium");
  const [customMaxFee, setCustomMaxFee] = useState("");
  const [customPriorityFee, setCustomPriorityFee] = useState("");
  const [sniperMode, setSniperMode]     = useState(false);
  const [sniperTimeout, setSniperTimeout] = useState(60);

  // Function override (user can manually pick which mint fn to use)
  const [overrideFn, setOverrideFn] = useState<string>("");

  // Mint result
  const [mintStatus, setMintStatus] = useState<MintStatus>("idle");
  const [mintResult, setMintResult] = useState<{
    txHash?: string; gasEstimate?: string; gasWithBuffer?: string;
    detectedFn?: string; abiSource?: string; error?: string;
    mintType?: string; ticketSource?: string; needsTicket?: boolean; code?: string;
  } | null>(null);

  // Derived — the currently selected chain object
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
      .then((d) => { setHistory((d as { mints: MintHistory[] }).mints ?? []); setLoadingHistory(false); })
      .catch(() => setLoadingHistory(false));
  }, []);

  // Auto-detect contract info whenever address looks valid
  const autoDetect = useCallback(async (addr: string) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return;
    setDetectStatus("detecting");
    setContractCard(null);
    setDetectError("");
    try {
      const res = await fetch("/api/v1/nft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "autodetect", contractAddress: addr }),
      });
      const data = await res.json() as ContractCard & { error?: string; detectedChain?: string };
      if (data.error) {
        setDetectStatus("error");
        setDetectError(data.error);
      } else {
        setDetectStatus("done");
        setContractCard({
          ...data,
          detectedChain: data.detectedChain ?? chain,
          mintFunctions: data.mintFunctions ?? [],
          abiSource: data.abiSource ?? "fallback",
        });
        // Auto-select the chain the contract was found on
        if (data.detectedChain) setChain(data.detectedChain);
        // Auto-pick first non-proof function (avoid allowlist-only functions as default)
        if (data.mintFunctions?.length > 0) {
          const best = data.mintFunctions.find((f: MintFnInfo) => !f.requiresProof) ?? data.mintFunctions[0];
          setOverrideFn(best.signature);
        }
      }
    } catch (e) {
      setDetectStatus("error");
      setDetectError(String(e));
    }
  }, [chain]);

  function handleContractChange(val: string) {
    setContract(val);
    setContractCard(null);
    setDetectStatus("idle");
    setDetectError("");
    setMintResult(null);
    setOverrideFn("");
    if (/^0x[0-9a-fA-F]{40}$/.test(val)) autoDetect(val);
  }

  async function handleMint() {
    if (!walletId || !contract) return;
    const selectedWalletObj = wallets.find((w) => String(w.id) === walletId);
    const walletAddress = selectedWalletObj?.address ?? "";
    setMintResult(null);

    if (dryRun) {
      setMintStatus("simulating");
      const res = await fetch("/api/v1/nft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        action: "simulate", contractAddress: contract, chainSlug: chain, quantity, walletAddress,
        overrideFnSignature: overrideFn || undefined,
      }),
      });
      const data = await res.json() as {
        success?: boolean; gasEstimate?: string; gasWithBuffer?: string;
        detectedFn?: string; errorMessage?: string; error?: string;
        mintType?: string; ticketSource?: string; needsTicket?: boolean;
        abiSource?: string;
      };
      if (data.success === false || data.error) {
        setMintStatus("error");
        setMintResult({
          error: data.errorMessage ?? data.error ?? "Simulation failed",
          mintType: data.mintType,
          needsTicket: data.needsTicket,
        });
      } else {
        setMintStatus("success");
        setMintResult({
          gasEstimate: data.gasEstimate,
          gasWithBuffer: data.gasWithBuffer,
          detectedFn: data.detectedFn,
          abiSource: data.abiSource,
          mintType: data.mintType,
          ticketSource: data.ticketSource,
        });
        if (data.detectedFn) setOverrideFn(data.detectedFn);
      }
      return;
    }

    // Live mint — pass detectedFn from simulate if we have it
    setMintStatus("minting");
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
        detectedFn: overrideFn || mintResult?.detectedFn,
        ...(gasPreset === "custom" && customMaxFee ? {
          maxFeePerGasGwei: Number(customMaxFee),
          maxPriorityFeePerGasGwei: Number(customPriorityFee || "1"),
        } : {}),
        sniperMode,
        sniperTimeoutMs: sniperTimeout * 1000,
      }),
    });
    const data = await res.json() as {
      txHash?: string; gasUsed?: string; error?: string;
      code?: string;
    };
    if (data.error) {
      setMintStatus("error");
      // Surface a cleaner message for legacy bot wallet PIN issue
      if (data.code === "LEGACY_PIN_WALLET") {
        setMintResult({
          ...data,
          error: "Wallet ini dibuat oleh Telegram bot dan dilindungi PIN. Untuk menggunakannya di sini, silakan re-import via Settings \u2192 Wallets \u2192 Import Wallet (paste private key atau mnemonic).",
        });
      } else {
        setMintResult(data);
      }
    } else {
      setMintStatus("success");
      setMintResult(data);
      fetch("/api/v1/nft-history").then((r) => r.json())
        .then((d) => setHistory((d as { mints: MintHistory[] }).mints ?? []));
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-mono font-bold text-foreground">NFTHood</h2>
        <p className="text-xs font-mono text-muted-foreground mt-0.5">
          Mint NFT on Ethereum, Robinhood Chain, Base, or Sepolia (testnet).
        </p>
      </div>

      {/* Contract address input + auto-detect card */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Contract</p>
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground">
            {tr.contractAddress} <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="0x... (paste to auto-detect)"
              value={contract}
              onChange={(e) => handleContractChange(e.target.value.trim())}
              className="w-full bg-background border border-border rounded px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 pr-10"
            />
            {detectStatus === "detecting" && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground animate-pulse">
                scanning...
              </span>
            )}
          </div>
        </div>

        {/* Contract info card */}
        {detectStatus === "error" && (
          <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-xs font-mono text-destructive">{detectError}</p>
          </div>
        )}

        {detectStatus === "done" && contractCard && (
          <div className={`rounded border px-3 py-3 space-y-1.5 ${contractCard.hasCode ? "border-primary/20 bg-primary/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-mono font-bold text-foreground truncate">
                {contractCard.name} <span className="text-muted-foreground font-normal">({contractCard.symbol})</span>
              </p>
              <span className="text-[10px] font-mono border border-border rounded px-1.5 py-0.5 text-muted-foreground shrink-0">
                {contractCard.standard}
              </span>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
              <div>
                <p className="text-[10px] font-mono text-muted-foreground/60 uppercase">Chain</p>
                <p className="text-xs font-mono text-foreground capitalize">{contractCard.detectedChain}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground/60 uppercase">Phase</p>
                <p className={`text-xs font-mono font-semibold capitalize ${PHASE_COLOR[contractCard.phase] ?? "text-foreground"}`}>
                  {contractCard.phase}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground/60 uppercase">Mint Price</p>
                <p className="text-xs font-mono text-foreground">
                  {parseFloat(contractCard.mintPrice) === 0 ? "Free" : `${contractCard.mintPrice} ETH`}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono text-muted-foreground/60 uppercase">Supply</p>
                <p className="text-xs font-mono text-foreground">
                  {contractCard.totalSupply}{contractCard.maxSupply !== "0" ? ` / ${contractCard.maxSupply}` : ""}
                  {contractCard.remaining !== "unknown" && contractCard.maxSupply !== "0" && (
                    <span className="text-muted-foreground/60"> ({contractCard.remaining} left)</span>
                  )}
                </p>
              </div>
            </div>

            {/* ABI source badge */}
            <div className="flex items-center gap-2 pt-1">
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${contractCard.abiSource === "explorer" ? "border-primary/30 text-primary bg-primary/5" : "border-muted text-muted-foreground/60"}`}>
                ABI: {contractCard.abiSource === "explorer" ? "verified" : "fallback"}
              </span>
              {contractCard.mintFunctions.length > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground/60">
                  {contractCard.mintFunctions.length} mint fn{contractCard.mintFunctions.length > 1 ? "s" : ""} found
                </span>
              )}
            </div>

            {/* Paused warning */}
            {contractCard.phase === "paused" && (
              <div className="flex items-start gap-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1.5 mt-1">
                <span className="text-yellow-400 text-[10px] font-mono leading-relaxed">
                  Mint is currently <strong>Paused</strong> — simulate will fail until the owner opens mint.
                  You can still simulate to test the function signature.
                </span>
              </div>
            )}

            {/* Detected mint functions — user can override */}
            {contractCard.mintFunctions.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Mint Function</p>
                <div className="flex flex-wrap gap-1.5">
                  {contractCard.mintFunctions.map((fn) => (
                    <button
                      key={fn.signature}
                      onClick={() => setOverrideFn(fn.signature)}
                      className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
                        overrideFn === fn.signature
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {fn.signature}
                      {fn.mintType === "signature" && (
                        <span className="ml-1 text-blue-400/80" title="Server-signed ticket — fetched automatically">ticket</span>
                      )}
                      {fn.mintType === "merkle" && (
                        <span className="ml-1 text-yellow-400/70" title="Requires merkle proof">proof</span>
                      )}
                      {fn.payable && fn.mintType === "open" && (
                        <span className="ml-1 opacity-40">payable</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Signature-based notice — shown when selected fn needs a ticket */}
                {contractCard.mintFunctions.find((f) => f.signature === overrideFn)?.mintType === "signature" && (
                  <div className="flex items-start gap-1.5 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1.5">
                    <span className="text-blue-400 text-[10px] font-mono leading-relaxed">
                      <strong>Server-signed mint</strong> — bot will automatically request a mint ticket from the project API before executing. No manual input needed.
                    </span>
                  </div>
                )}

                {contractCard.mintFunctions.every((f) => f.mintType === "merkle") && (
                  <p className="text-[10px] font-mono text-yellow-400/80">
                    All functions require a merkle proof — this may be an allowlist-only mint.
                  </p>
                )}
              </div>
            )}

            {contractCard.mintFunctions.length === 0 && contractCard.hasCode && (
              <p className="text-[10px] font-mono text-yellow-400/80 pt-1">
                ABI unverified — will try common signatures automatically.
              </p>
            )}

            {!contractCard.hasCode && (
              <p className="text-[11px] font-mono text-yellow-400 pt-1">
                No bytecode found on the selected chain. Try a different network.
              </p>
            )}
          </div>
        )}
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
                {c.isTestnet && (
                  <span className="ml-1.5 text-[9px] font-mono border border-yellow-500/40 text-yellow-400 bg-yellow-500/10 rounded px-1 py-0.5 align-middle">
                    TEST
                  </span>
                )}
              </button>
            ))}
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

        {/* Quantity */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground">{tr.quantity}</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-9 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 font-mono text-lg transition-colors"
            >-</button>
            <input
              type="number" min={1} max={20} value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value))))}
              className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm font-mono text-foreground text-center focus:outline-none focus:border-primary/50"
            />
            <button
              onClick={() => setQuantity(Math.min(20, quantity + 1))}
              className="w-8 h-9 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 font-mono text-lg transition-colors"
            >+</button>
          </div>
        </div>

        {/* Gas preset */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Gas Speed</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(["low","medium","high","custom"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setGasPreset(p)}
                className={`py-1.5 rounded border text-[11px] font-mono transition-colors ${
                  gasPreset === p
                    ? p === "high" ? "border-orange-400/60 bg-orange-400/10 text-orange-400"
                                   : "border-primary/50 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                {p === "low" ? "Low" : p === "medium" ? "Med" : p === "high" ? "High" : "Custom"}
              </button>
            ))}
          </div>
          <p className="text-[10px] font-mono text-muted-foreground/60">
            {gasPreset === "low"    && "Exact estimate — may fail on busy chains."}
            {gasPreset === "medium" && "+20% buffer — recommended."}
            {gasPreset === "high"   && "+50% buffer — fast confirmation."}
            {gasPreset === "custom" && "Set exact Max Fee and Priority Fee below."}
          </p>
          {gasPreset === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground">Max Fee (Gwei)</label>
                <input type="number" min="0" step="0.01" placeholder="e.g. 20" value={customMaxFee}
                  onChange={(e) => setCustomMaxFee(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2.5 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground">Priority Fee (Gwei)</label>
                <input type="number" min="0" step="0.01" placeholder="e.g. 1.5" value={customPriorityFee}
                  onChange={(e) => setCustomPriorityFee(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2.5 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary/50" />
              </div>
            </div>
          )}
        </div>

        {/* Sniper Mode — live mint only */}
        {!dryRun && (
          <div className="rounded border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div onClick={() => setSniperMode(!sniperMode)}
                className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer shrink-0 ${sniperMode ? "bg-yellow-400/70" : "bg-muted"}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-foreground transition-transform ${sniperMode ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <div>
                <p className="text-xs font-mono text-foreground font-semibold">Sniper Mode</p>
                <p className="text-[10px] font-mono text-muted-foreground">Keep retrying until success or timeout</p>
              </div>
            </label>
            {sniperMode && (
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-muted-foreground">Timeout (seconds)</label>
                <input type="number" min="10" max="300" step="5" value={sniperTimeout}
                  onChange={(e) => setSniperTimeout(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded px-2.5 py-2 text-xs font-mono text-foreground focus:outline-none focus:border-primary/50" />
              </div>
            )}
          </div>
        )}

        {/* Dry run toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div onClick={() => setDryRun(!dryRun)}
            className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${dryRun ? "bg-primary/60" : "bg-muted"}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-foreground transition-transform ${dryRun ? "translate-x-0.5" : "translate-x-4"}`} />
          </div>
          <span className="text-sm font-mono text-muted-foreground">Dry Run (simulate only)</span>
        </label>

        {/* Submit */}
        <button
          onClick={handleMint}
          disabled={BUSY.includes(mintStatus) || !walletId || !contract || detectStatus === "detecting"}
          className="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-mono font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {mintStatus === "simulating" ? "Simulating..." :
           mintStatus === "minting" ? (
             contractCard?.mintFunctions.find((f) => f.signature === overrideFn)?.mintType === "signature"
               ? "Fetching ticket + Minting..."
               : "Minting..."
           ) :
           dryRun ? `Simulate on ${selectedChain.name}` : `Mint on ${selectedChain.name}`}
        </button>

        {/* Mint result */}
        {mintResult && (
          <div className={`rounded border px-4 py-3 space-y-1.5 ${mintResult.error ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
            {mintResult.error ? (
              <p className="text-xs font-mono text-destructive break-words">{mintResult.error}</p>
            ) : (
              <>
                {mintResult.gasEstimate && (
                  <p className="text-xs font-mono text-muted-foreground">
                    Gas: <span className="text-foreground">{mintResult.gasEstimate}</span>
                    {mintResult.gasWithBuffer && (
                      <span className="text-muted-foreground/60"> (+25% buffer: {mintResult.gasWithBuffer})</span>
                    )}
                  </p>
                )}
                {mintResult.detectedFn && (
                  <p className="text-[10px] font-mono text-muted-foreground/60">
                    Fn: <span className="text-foreground">{mintResult.detectedFn}</span>
                    {mintResult.mintType && mintResult.mintType !== "open" && (
                      <span className={`ml-2 ${mintResult.mintType === "signature" ? "text-blue-400/80" : "text-yellow-400/70"}`}>
                        [{mintResult.mintType}]
                      </span>
                    )}
                    {mintResult.abiSource && (
                      <span className="ml-2 opacity-50">({mintResult.abiSource} ABI)</span>
                    )}
                  </p>
                )}
                {mintResult.ticketSource && (
                  <p className="text-[10px] font-mono text-blue-400/70">
                    Ticket: <span className="opacity-80">{mintResult.ticketSource}</span>
                  </p>
                )}
                {mintResult.txHash && (
                  <a href={`${selectedChain.explorer}/tx/${mintResult.txHash}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-primary hover:underline block">
                    Tx: {mintResult.txHash.slice(0, 14)}...{mintResult.txHash.slice(-8)}
                  </a>
                )}
                {dryRun && !mintResult.txHash && (
                  <p className="text-[10px] font-mono text-primary/80 pt-1">
                    Simulation OK — disable Dry Run to execute real mint.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Mint history */}
      <div className="space-y-2">
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground px-1">Mint History</p>
        {loadingHistory && (
          <div className="space-y-2">
            {[1,2].map((i) => <div key={i} className="h-12 rounded-lg border border-border bg-card animate-pulse" />)}
          </div>
        )}
        {!loadingHistory && history.length === 0 && (
          <div className="rounded-lg border border-border/50 bg-card/50 px-4 py-5 text-center">
            <p className="text-xs font-mono text-muted-foreground/60">No mints yet.</p>
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
                    qty: {m.quantity} · {new Date(m.mintedAt).toLocaleDateString()}
                  </p>
                </div>
                {m.txHash && (
                  <a href={`${selectedChain.explorer}/tx/${m.txHash}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-primary hover:underline shrink-0">Tx</a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
