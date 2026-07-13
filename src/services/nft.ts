import { parseAbi, parseEther, parseGwei, formatEther, encodeFunctionData } from "viem";
import {
  getPublicClient,
  getWalletClient,
  getPublicClientForChain,
  getWalletClientForChain,
  type MintChainSlug,
} from "./chain";

// ─── Interface IDs ────────────────────────────────────────────────────────────
const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC1155_INTERFACE_ID = "0xd9b67a26";

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const ERC165_ABI = parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

const ERC721_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
]);

const MINT_ABI = parseAbi([
  "function mint(uint256 quantity) payable",
  "function mint(address to, uint256 quantity) payable",
  "function publicMint(uint256 quantity) payable",
  "function mintPublic(uint256 quantity) payable",
  "function safeMint(address to) payable",
  "function mintTo(address recipient, uint256 count) payable",
]);

const PRICE_ABI = parseAbi([
  "function price() view returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function cost() view returns (uint256)",
  "function PRICE() view returns (uint256)",
  "function publicSalePrice() view returns (uint256)",
]);

// Phase detection ABIs — inspired by MINTER's phase enum logic
const PHASE_ABI = parseAbi([
  "function paused() view returns (bool)",
  "function saleIsActive() view returns (bool)",
  "function publicSaleActive() view returns (bool)",
  "function mintingEnabled() view returns (bool)",
  "function mintOpen() view returns (bool)",
  "function isPublicMintEnabled() view returns (bool)",
]);

// Allowlist / WL check ABIs
const ALLOWLIST_ABI = parseAbi([
  "function isAllowlisted(address account) view returns (bool)",
  "function isWhitelisted(address account) view returns (bool)",
  "function allowlist(address account) view returns (bool)",
]);

// ─── Types ────────────────────────────────────────────────────────────────────
export type NftStandard = "ERC721" | "ERC1155" | "UNKNOWN";

export type MintPhase = "unknown" | "paused" | "allowlist" | "public" | "soldout";

export interface NftContractInfo {
  address: string;
  chainSlug: MintChainSlug;
  standard: NftStandard;
  name: string;
  symbol: string;
  totalSupply: string;
  maxSupply: string;
  mintPrice: string; // in ETH
  mintPriceWei: bigint;
  isLive: boolean;
  hasCode: boolean;
  phase: MintPhase;
  remaining: string; // "unknown" or number string
}

// ─── Error classification (from MINTER's classify_mint_error) ─────────────────
export function classifyMintError(msg: string): "fatal" | "retryable" {
  const lower = msg.toLowerCase();

  // Fatal — insufficient funds, never retry
  if (
    lower.includes("insufficient funds") ||
    lower.includes("insufficient balance") ||
    lower.includes("exceeds balance") ||
    lower.includes("out of funds")
  ) {
    return "fatal";
  }

  // Fatal contract errors
  const fatalPatterns = [
    "invalidproof",
    "payernotallowed",
    "signaturealreadyused",
    "incorrectpayment",
    "mintquantityexceedsmaxmintedperwallet",
    "mintquantityexceedsmaxsupply",
    "maxsupplyreached",
    "soldout",
    "exceeds max supply",
  ];
  for (const pat of fatalPatterns) {
    if (lower.includes(pat)) return "fatal";
  }

  return "retryable";
}

// ─── Auto-detect which chain a contract is on ─────────────────────────────────
// Checks all SUPPORTED_MINT_CHAINS in parallel — returns the slug of the first
// chain where the address has bytecode.
export async function autoDetectChain(contractAddress: string): Promise<MintChainSlug | null> {
  const { SUPPORTED_MINT_CHAINS } = await import("./chain");
  const addr = contractAddress as `0x${string}`;

  const results = await Promise.allSettled(
    SUPPORTED_MINT_CHAINS.map(async (c) => {
      const client = c.slug === "robinhood"
        ? getPublicClient()
        : getPublicClientForChain(c.slug as MintChainSlug);
      const code = await client.getCode({ address: addr });
      if (code && code !== "0x") return c.slug as MintChainSlug;
      throw new Error("no code");
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") return r.value;
  }
  return null;
}

// ─── Contract detection ───────────────────────────────────────────────────────
export async function detectNftContract(
  contractAddress: string,
  chainSlug: MintChainSlug = "robinhood"
): Promise<NftContractInfo> {
  const publicClient = chainSlug === "robinhood"
    ? getPublicClient()
    : getPublicClientForChain(chainSlug);
  const addr = contractAddress as `0x${string}`;

  const code = await publicClient.getCode({ address: addr });
  if (!code || code === "0x") {
    return {
      address: contractAddress,
      chainSlug,
      standard: "UNKNOWN",
      name: "Not a contract — check chain selection",
      symbol: "",
      totalSupply: "0",
      maxSupply: "0",
      mintPrice: "0",
      mintPriceWei: 0n,
      isLive: false,
      hasCode: false,
      phase: "unknown",
      remaining: "unknown",
    };
  }

  // Detect standard
  let standard: NftStandard = "UNKNOWN";
  try {
    const is721 = await publicClient.readContract({
      address: addr,
      abi: ERC165_ABI,
      functionName: "supportsInterface",
      args: [ERC721_INTERFACE_ID as `0x${string}`],
    });
    if (is721) standard = "ERC721";
  } catch {}

  if (standard === "UNKNOWN") {
    try {
      const is1155 = await publicClient.readContract({
        address: addr,
        abi: ERC165_ABI,
        functionName: "supportsInterface",
        args: [ERC1155_INTERFACE_ID as `0x${string}`],
      });
      if (is1155) standard = "ERC1155";
    } catch {}
  }

  // Read metadata
  let name = "";
  let symbol = "";
  let totalSupply = "0";
  let maxSupply = "0";

  try { name = await publicClient.readContract({ address: addr, abi: ERC721_ABI, functionName: "name" }); } catch {}
  try { symbol = await publicClient.readContract({ address: addr, abi: ERC721_ABI, functionName: "symbol" }); } catch {}
  try {
    const ts = await publicClient.readContract({ address: addr, abi: ERC721_ABI, functionName: "totalSupply" });
    totalSupply = ts.toString();
  } catch {}
  try {
    const ms = await publicClient.readContract({ address: addr, abi: ERC721_ABI, functionName: "maxSupply" });
    maxSupply = ms.toString();
  } catch {}

  // Mint price
  let mintPriceWei = 0n;
  const priceFns = ["price", "mintPrice", "cost", "PRICE", "publicSalePrice"] as const;
  for (const fn of priceFns) {
    try {
      mintPriceWei = await publicClient.readContract({ address: addr, abi: PRICE_ABI, functionName: fn });
      break;
    } catch {}
  }

  // Phase detection — try multiple common state flags
  let phase: MintPhase = "unknown";
  try {
    const paused = await publicClient.readContract({ address: addr, abi: PHASE_ABI, functionName: "paused" });
    if (paused) phase = "paused";
  } catch {}

  if (phase === "unknown") {
    const activeChecks: Array<"saleIsActive" | "publicSaleActive" | "mintingEnabled" | "mintOpen" | "isPublicMintEnabled"> =
      ["saleIsActive", "publicSaleActive", "mintingEnabled", "mintOpen", "isPublicMintEnabled"];
    for (const fn of activeChecks) {
      try {
        const active = await publicClient.readContract({ address: addr, abi: PHASE_ABI, functionName: fn });
        if (active) { phase = "public"; break; }
        else { phase = "paused"; break; }
      } catch {}
    }
  }

  // Sold out check
  if (maxSupply !== "0" && totalSupply !== "0") {
    if (BigInt(totalSupply) >= BigInt(maxSupply)) phase = "soldout";
  }

  // Remaining supply
  let remaining = "unknown";
  if (maxSupply !== "0") {
    const rem = BigInt(maxSupply) - BigInt(totalSupply);
    remaining = rem.toString();
  }

  const mintPrice = formatEther(mintPriceWei);
  const isLive = standard !== "UNKNOWN";

  return {
    address: contractAddress,
    chainSlug,
    standard,
    name: name || "Unknown Collection",
    symbol: symbol || "NFT",
    totalSupply,
    maxSupply,
    mintPrice,
    mintPriceWei,
    isLive,
    hasCode: true,
    phase,
    remaining,
  };
}

// ─── WL eligibility check ─────────────────────────────────────────────────────
export async function checkAllowlist(
  contractAddress: string,
  walletAddress: string
): Promise<boolean | null> {
  const publicClient = getPublicClient();
  const addr = contractAddress as `0x${string}`;
  const wallet = walletAddress as `0x${string}`;

  const fns: Array<"isAllowlisted" | "isWhitelisted" | "allowlist"> = [
    "isAllowlisted",
    "isWhitelisted",
    "allowlist",
  ];

  for (const fn of fns) {
    try {
      const result = await publicClient.readContract({
        address: addr,
        abi: ALLOWLIST_ABI,
        functionName: fn,
        args: [wallet],
      });
      return result;
    } catch {}
  }
  return null; // contract doesn't have allowlist function
}

// ─── Simulate mint (dry-run) ──────────────────────────────────────────────────
export interface SimulateResult {
  success: boolean;
  gasEstimate: string;      // raw gas units
  gasWithBuffer: string;    // +20% safe buffer for L2/Orbit
  errorMessage?: string;
  errorType?: "fatal" | "retryable";
  detectedFn?: string;      // which function signature worked
}

// All mint function selectors we try — ordered by prevalence
const SIM_ATTEMPTS = [
  { fn: "mint",        args: (qty: bigint, _from: `0x${string}`) => [qty]        },
  { fn: "publicMint",  args: (qty: bigint, _from: `0x${string}`) => [qty]        },
  { fn: "mintPublic",  args: (qty: bigint, _from: `0x${string}`) => [qty]        },
  { fn: "mint",        args: (qty: bigint,  from: `0x${string}`) => [from, qty]  },
  { fn: "safeMint",    args: (_qty: bigint, from: `0x${string}`) => [from]       },
  { fn: "mintTo",      args: (qty: bigint,  from: `0x${string}`) => [from, qty]  },
] as const;

export async function simulateMint(
  contractAddress: string,
  quantity: number,
  mintPriceWei: bigint,
  walletAddress: string,
  chainSlug: MintChainSlug = "robinhood"
): Promise<SimulateResult> {
  const publicClient = chainSlug === "robinhood"
    ? getPublicClient()
    : getPublicClientForChain(chainSlug);
  const addr = contractAddress as `0x${string}`;
  const from = walletAddress as `0x${string}`;
  const totalValue = mintPriceWei * BigInt(quantity);
  const qty = BigInt(quantity);

  let lastMsg = "";

  for (const attempt of SIM_ATTEMPTS) {
    try {
      const gas = await publicClient.estimateContractGas({
        address: addr,
        abi: MINT_ABI,
        functionName: attempt.fn as "mint" | "publicMint" | "mintPublic" | "safeMint" | "mintTo",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: attempt.args(qty, from) as any,
        account: from,
        value: totalValue,
      });
      const gasWithBuffer = BigInt(Math.ceil(Number(gas) * 1.25));
      return {
        success: true,
        gasEstimate: gas.toString(),
        gasWithBuffer: gasWithBuffer.toString(),
        detectedFn: `${attempt.fn}(${attempt.args(qty, from).map(String).join(", ")})`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastMsg = msg;

      // ── Determine why this failed ─────────────────────────────────────────
      // ABI/selector mismatch: function doesn't exist on the contract at all.
      // These are safe to skip — try the next signature.
      const isAbiMismatch =
        msg.includes("does not exist on the contract") ||
        msg.includes("Function not found") ||
        msg.includes("Unknown function") ||
        msg.includes("invalid selector") ||
        msg.includes("no matching function") ||
        msg.includes("UNPREDICTABLE_GAS_LIMIT") ||
        // viem surfaces this when the 4-byte selector isn't in the ABI
        (msg.includes("ContractFunctionExecutionError") && msg.includes("does not exist"));

      if (isAbiMismatch) {
        // Silently skip — contract doesn't have this signature
        continue;
      }

      // Anything else (revert with reason, insufficient funds, sold out, wrong value…)
      // means the function EXISTS but the call failed for a real reason.
      // Surface the error immediately — do NOT try other signatures.
      const errorType = classifyMintError(msg);
      return {
        success: false,
        gasEstimate: "0",
        gasWithBuffer: "0",
        errorMessage: msg.slice(0, 240),
        errorType,
      };
    }
  }

  return {
    success: false,
    gasEstimate: "0",
    gasWithBuffer: "0",
    errorMessage: lastMsg
      ? `Simulation failed: ${lastMsg.slice(0, 160)}`
      : "No compatible mint function found. The contract may use a custom ABI or is not yet mintable.",
    errorType: "retryable",
  };
}

// ─── Mint NFT ─────────────────────────────────────────────────────────────────
// Gas preset multipliers (applied on top of estimateGas)
export type GasPreset = "low" | "medium" | "high" | "custom";
export const GAS_MULTIPLIERS: Record<GasPreset, number> = {
  low: 1.0,      // exact estimate — risk of underpricing on congested chains
  medium: 1.2,   // +20% buffer — recommended
  high: 1.5,     // +50% buffer — fast confirmation
  custom: 1.0,   // uses explicit maxFeePerGas / maxPriorityFeePerGas from caller
};

export interface MintNftParams {
  contractAddress: string;
  quantity: number;
  mintPriceWei: bigint;
  privateKey: `0x${string}`;
  recipientAddress: string;
  chainSlug?: MintChainSlug;
  // If provided (from prior simulate), use this signature directly — skip trial-and-error
  detectedFn?: string; // e.g. "mint" | "publicMint" | "mintTo" etc.
  // Gas settings
  gasPreset?: GasPreset;
  maxFeePerGasGwei?: number;       // only used when gasPreset === "custom"
  maxPriorityFeePerGasGwei?: number;
  // Sniper mode: keep retrying mint until success or timeout
  sniperMode?: boolean;
  sniperTimeoutMs?: number;        // default 60_000 ms
}

export interface MintNftResult {
  txHash: string;
  gasUsed?: string;
}

// ─── Gas override helper ──────────────────────────────────────────────────────
async function resolveGasOverrides(
  publicClient: ReturnType<typeof getPublicClientForChain>,
  gasPreset: GasPreset,
  maxFeePerGasGwei?: number,
  maxPriorityFeePerGasGwei?: number,
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | undefined> {
  if (gasPreset === "custom" && maxFeePerGasGwei && maxPriorityFeePerGasGwei) {
    return {
      maxFeePerGas: parseGwei(String(maxFeePerGasGwei)),
      maxPriorityFeePerGas: parseGwei(String(maxPriorityFeePerGasGwei)),
    };
  }
  if (gasPreset === "low") return undefined; // let viem auto-handle

  try {
    const feeData = await publicClient.estimateFeesPerGas();
    const multiplier = GAS_MULTIPLIERS[gasPreset];
    const baseFee = feeData.maxFeePerGas ?? 0n;
    const priority = feeData.maxPriorityFeePerGas ?? parseGwei("1");
    return {
      maxFeePerGas: BigInt(Math.ceil(Number(baseFee) * multiplier)),
      maxPriorityFeePerGas: BigInt(Math.ceil(Number(priority) * multiplier)),
    };
  } catch {
    return undefined; // chain may not support EIP-1559 — fall through to legacy
  }
}

export async function mintNft(params: MintNftParams): Promise<MintNftResult> {
  const slug = params.chainSlug ?? "robinhood";
  const publicClient = slug === "robinhood"
    ? getPublicClient()
    : getPublicClientForChain(slug);
  const { client: walletClient, account } = slug === "robinhood"
    ? getWalletClient(params.privateKey)
    : getWalletClientForChain(params.privateKey, slug);
  const addr = params.contractAddress as `0x${string}`;
  const totalValue = params.mintPriceWei * BigInt(params.quantity);
  const preset = params.gasPreset ?? "medium";

  // Resolve gas overrides once (EIP-1559 buffer or custom)
  const gasOverrides = await resolveGasOverrides(
    publicClient,
    preset,
    params.maxFeePerGasGwei,
    params.maxPriorityFeePerGasGwei,
  );

  // Sniper loop — retry until timeout or success
  const sniperTimeout = params.sniperMode ? (params.sniperTimeoutMs ?? 60_000) : 0;
  const deadline = Date.now() + sniperTimeout;
  let attempt = 0;

  do {
    attempt++;
    if (attempt > 1) {
      // Brief pause between sniper retries to avoid hammering RPC
      await new Promise((r) => setTimeout(r, 1500));
    }

    // If a specific function was detected by simulateMint, use it directly.
    // Otherwise fall back to trying all known signatures.
    type WriteFn = () => Promise<`0x${string}`>;
    const ALL_MINT_ATTEMPTS: WriteFn[] = [
      () => walletClient.writeContract({
        address: addr, abi: MINT_ABI, functionName: "mint",
        args: [BigInt(params.quantity)], value: totalValue, ...gasOverrides,
      }),
      () => walletClient.writeContract({
        address: addr, abi: MINT_ABI, functionName: "publicMint",
        args: [BigInt(params.quantity)], value: totalValue, ...gasOverrides,
      }),
      () => walletClient.writeContract({
        address: addr, abi: MINT_ABI, functionName: "mintPublic",
        args: [BigInt(params.quantity)], value: totalValue, ...gasOverrides,
      }),
      () => walletClient.writeContract({
        address: addr, abi: MINT_ABI, functionName: "mint",
        args: [account.address, BigInt(params.quantity)], value: totalValue, ...gasOverrides,
      }),
      () => walletClient.writeContract({
        address: addr, abi: MINT_ABI, functionName: "safeMint",
        args: [account.address], value: totalValue, ...gasOverrides,
      }),
      () => walletClient.writeContract({
        address: addr, abi: MINT_ABI, functionName: "mintTo",
        args: [account.address, BigInt(params.quantity)], value: totalValue, ...gasOverrides,
      }),
    ];

    // Build the attempt list: if detectedFn is known, put that first (and only try it)
    let mintAttempts: WriteFn[];
    if (params.detectedFn) {
      const fnName = params.detectedFn; // e.g. "mint", "publicMint", "mintTo"
      const hasAddress = fnName.includes(account.address);
      const fnBase = fnName.split("(")[0];
      const matched = ALL_MINT_ATTEMPTS.filter((_, i) => {
        // Map index to function names in same order as ALL_MINT_ATTEMPTS above
        const names = ["mint","publicMint","mintPublic","mint_addr","safeMint","mintTo"];
        const n = names[i];
        if (fnBase === "mint" && hasAddress) return n === "mint_addr";
        if (fnBase === "mint") return n === "mint";
        return n === fnBase;
      });
      mintAttempts = matched.length > 0 ? [...matched, ...ALL_MINT_ATTEMPTS] : ALL_MINT_ATTEMPTS;
    } else {
      mintAttempts = ALL_MINT_ATTEMPTS;
    }

    let lastError: unknown;
    for (const fn of mintAttempts) {
      try {
        const txHash = await fn();
        // Wait for receipt with explicit timeout (30s) and single confirmation
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations: 1,
          timeout: 30_000,
        });
        return { txHash, gasUsed: receipt.gasUsed.toString() };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (classifyMintError(msg) === "fatal") throw new Error(msg);
        lastError = err;
      }
    }

    // In sniper mode, loop back if not yet past deadline and last error was retryable
    const retryable = lastError
      ? classifyMintError(lastError instanceof Error ? lastError.message : String(lastError)) !== "fatal"
      : false;

    if (!params.sniperMode || !retryable || Date.now() >= deadline) {
      throw new Error(
        `All mint signatures failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`
      );
    }
    // eslint-disable-next-line no-constant-condition
  } while (true);
}

// ─── Format helpers ───────────────────────────────────────────────────────────
const PHASE_LABELS: Record<MintPhase, string> = {
  unknown: "Unknown",
  paused: "Paused",
  allowlist: "Allowlist only",
  public: "Public — LIVE",
  soldout: "Sold out",
};

export function formatContractInfo(info: NftContractInfo): string {
  const priceDisplay = info.mintPriceWei === 0n
    ? "Free"
    : `${parseFloat(info.mintPrice).toFixed(6)} ETH`;

  const supplyLine = info.maxSupply !== "0"
    ? `${info.totalSupply} / ${info.maxSupply} (${info.remaining} left)`
    : `${info.totalSupply} minted`;

  const lines = [
    `<b>${info.name}</b> (${info.symbol})`,
    `Standard: ${info.standard}`,
    `Address: <code>${info.address}</code>`,
    `Supply: ${supplyLine}`,
    `Price: ${priceDisplay}`,
    `Phase: ${PHASE_LABELS[info.phase]}`,
  ];
  return lines.join("\n");
}
