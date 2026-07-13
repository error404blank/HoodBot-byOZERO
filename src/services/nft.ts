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
      standard: "UNKNOWN",
      name: "Not a contract",
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
  gasEstimate: string;
  errorMessage?: string;
  errorType?: "fatal" | "retryable";
}

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

  // Try each mint function signature and simulate
  const attempts = [
    { fn: "mint", args: [BigInt(quantity)] },
    { fn: "publicMint", args: [BigInt(quantity)] },
    { fn: "mintPublic", args: [BigInt(quantity)] },
    { fn: "mint", args: [from, BigInt(quantity)] },
  ] as const;

  let lastMsg = "";

  for (const attempt of attempts) {
    try {
      const gas = await publicClient.estimateContractGas({
        address: addr,
        abi: MINT_ABI,
        functionName: attempt.fn as "mint" | "publicMint" | "mintPublic",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: attempt.args as any,
        account: from,
        value: totalValue,
      });
      return { success: true, gasEstimate: gas.toString() };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastMsg = msg;

      // Fatal errors — stop immediately, no point trying more signatures
      const errorType = classifyMintError(msg);
      if (errorType === "fatal") {
        return { success: false, gasEstimate: "0", errorMessage: msg, errorType: "fatal" };
      }

      // "Function not found" errors — try next signature silently
      const isMissingFn =
        msg.includes("is not a function") ||
        msg.includes("does not exist") ||
        msg.includes("ContractFunctionExecutionError") ||
        msg.includes("execution reverted") ||
        msg.includes("selector not found") ||
        msg.includes("UNPREDICTABLE_GAS_LIMIT");

      if (!isMissingFn) {
        // Unexpected error — return immediately
        return { success: false, gasEstimate: "0", errorMessage: msg, errorType: "retryable" };
      }
      // otherwise continue to next signature
    }
  }

  // All signatures tried — return a helpful message
  return {
    success: false,
    gasEstimate: "0",
    errorMessage: lastMsg
      ? `Simulation failed: ${lastMsg.slice(0, 120)}`
      : "Could not detect a valid mint function on this contract. It may use a custom signature or not be a mintable contract.",
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

    const mintAttempts: Array<() => Promise<`0x${string}`>> = [
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
