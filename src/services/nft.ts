import { parseAbi, parseGwei, formatEther, type Abi } from "viem";
import {
  getPublicClient,
  getWalletClient,
  getPublicClientForChain,
  getWalletClientForChain,
  type MintChainSlug,
  SUPPORTED_MINT_CHAINS,
} from "./chain";

// ─── Interface IDs ────────────────────────────────────────────────────────────
const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC1155_INTERFACE_ID = "0xd9b67a26";

// ─── Explorer ABI fetching ────────────────────────────────────────────────────
// ALL endpoints use Blockscout v2 REST API — no API key required.
// Etherscan requires an API key so we use public Blockscout instances instead.
const EXPLORER_ABI_URLS: Partial<Record<MintChainSlug, (addr: string) => string>> = {
  ethereum:  (addr) => `https://eth.blockscout.com/api/v2/smart-contracts/${addr}`,
  base:      (addr) => `https://base.blockscout.com/api/v2/smart-contracts/${addr}`,
  sepolia:   (addr) => `https://eth-sepolia.blockscout.com/api/v2/smart-contracts/${addr}`,
  robinhood: (addr) => `https://robinhoodchain.blockscout.com/api/v2/smart-contracts/${addr}`,
};

interface FetchedAbiResult {
  abi: Abi | null;
  source: "explorer" | "fallback";
}

// Fetch verified ABI from block explorer. Returns null if unverified or error.
// All URLs use Blockscout v2 REST API: GET /api/v2/smart-contracts/{address}
// Response: { abi: [...], is_verified: bool, name: string, ... }
export async function fetchContractAbi(
  contractAddress: string,
  chainSlug: MintChainSlug,
): Promise<FetchedAbiResult> {
  const urlFn = EXPLORER_ABI_URLS[chainSlug];
  if (!urlFn) return { abi: null, source: "fallback" };

  try {
    const url = urlFn(contractAddress);
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return { abi: null, source: "fallback" };

    const data = await res.json() as Record<string, unknown>;

    // Blockscout v2: { abi: [...], is_verified: true }
    if (Array.isArray(data.abi) && data.abi.length > 0 && data.is_verified) {
      return { abi: data.abi as Abi, source: "explorer" };
    }

    return { abi: null, source: "fallback" };
  } catch {
    return { abi: null, source: "fallback" };
  }
}

// ─── Known mint function signatures (ordered by prevalence) ──────────────────
export const KNOWN_MINT_SIGNATURES = [
  "mint(uint256)",
  "mint()",
  "mint(address,uint256)",
  "publicMint(uint256)",
  "mintPublic(uint256)",
  "claim(uint256)",
  "safeMint(address)",
  "mintTo(address,uint256)",
  "freeMint(uint256)",
  "freeMint()",
  "teamMint(uint256)",
  "devMint(uint256)",
] as const;

// From a verified ABI, return the first matching mint-candidate function name + inputs
export type MintType =
  | "open"        // mint(uint256), mint() — no off-chain data needed
  | "signature"   // mint(bytes32 salt, bytes sig) — needs server-signed ticket
  | "merkle"      // mint(bytes32[] proof, ...) — needs merkle proof from project
  | "token-gated" // requires owning another token to mint

export interface DetectedMintFn {
  name: string;
  inputs: Array<{ type: string; name?: string }>;
  signature: string; // e.g. "mint(uint256)"
  payable: boolean;
  requiresProof?: boolean; // true if takes bytes32/bytes (merkle proof, allowlist sig)
  mintType: MintType;
}

export function detectMintFunctionsFromAbi(abi: Abi): DetectedMintFn[] {
  // Keywords that indicate a public mint function
  const mintKeywords = ["mint", "claim", "purchase", "buy"];

  // Prefixes/patterns that indicate ADMIN/OWNER-ONLY functions — exclude these
  // even if they contain a mint keyword in their name
  const adminPrefixes = [
    "set",        // setMintOpen, setMintSigner, setMintPrice, setPublicMint
    "owner",      // ownerMint
    "admin",      // adminMint
    "team",       // teamMint
    "dev",        // devMint
    "withdraw",   // withdrawMint (rare but exists)
    "toggle",     // toggleMinting
    "pause",      // pauseMinting
    "unpause",    // unpauseMinting
    "enable",     // enableMinting
    "disable",    // disableMinting
    "update",     // updateMintPrice
  ];

  const results: DetectedMintFn[] = [];

  for (const item of abi) {
    if (item.type !== "function") continue;
    const name = item.name;
    const nameLower = name.toLowerCase();

    // Must contain a mint keyword
    if (!mintKeywords.some((kw) => nameLower.includes(kw))) continue;

    // Skip view/pure functions
    if (item.stateMutability === "view" || item.stateMutability === "pure") continue;

    // Skip admin/setter functions
    if (adminPrefixes.some((prefix) => nameLower.startsWith(prefix))) continue;

    // Skip functions that take a bool — almost always a toggle/setter
    const inputs = item.inputs ?? [];
    if (inputs.some((i) => i.type === "bool")) continue;

    const sig = `${name}(${inputs.map((i) => i.type).join(",")})`;

    // Classify mint type based on input argument patterns
    const inputTypes = inputs.map((i) => i.type);
    const inputNames = inputs.map((i) => (i.name ?? "").toLowerCase());
    let mintType: MintType = "open";
    let requiresProof = false;

    // Signature-based: takes (bytes32 salt, bytes signature) or (bytes32, bytes)
    // This is the ECDSA server-signed ticket pattern (e.g. ASCII CATS)
    const hasSalt = inputTypes.includes("bytes32") && inputNames.some((n) => n.includes("salt") || n === "");
    const hasSignatureArg = inputTypes.includes("bytes") && inputNames.some((n) =>
      n.includes("sig") || n.includes("signature") || n.includes("ticket") || n === ""
    );
    if (hasSalt && hasSignatureArg) {
      mintType = "signature";
      requiresProof = true;
    }
    // Merkle-based: takes bytes32[] proof
    else if (inputTypes.includes("bytes32[]")) {
      mintType = "merkle";
      requiresProof = true;
    }
    // bytes32 alone (single hash — could be merkle leaf or allowlist sig)
    else if (inputTypes.includes("bytes32") || inputTypes.includes("bytes")) {
      mintType = "merkle";
      requiresProof = true;
    }

    results.push({
      name,
      inputs: inputs.map((i) => ({ type: i.type, name: i.name ?? "" })),
      signature: sig,
      payable: item.stateMutability === "payable",
      requiresProof,
      mintType,
    });
  }

  // Sort: known signatures first
  results.sort((a, b) => {
    const ai = KNOWN_MINT_SIGNATURES.indexOf(a.signature as never);
    const bi = KNOWN_MINT_SIGNATURES.indexOf(b.signature as never);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return results;
}

// ─── Mint Ticket: server-signed free mints ───────────────────────────────────
// Some contracts use off-chain ECDSA signatures to prevent bots while keeping
// minting fully open. The project's backend hands out a (salt, signature) pair
// for any wallet that passes an anti-bot check (IP rate limit, CAPTCHA, etc.).
//
// We auto-probe a list of known API URL patterns for the contract/project.
// If we get a valid ticket we inject it into the mint call automatically.

export interface MintTicket {
  salt: `0x${string}`;
  signature: `0x${string}`;
  source: string; // which URL provided the ticket
}

// Known endpoint patterns for specific projects or generic patterns to probe
// Each entry: { test: fn to check if this provider applies, fetch: fn to get ticket }
interface TicketProvider {
  name: string;
  // Returns true if this provider should be tried for this contract
  matches: (contractAddress: string, chainSlug: MintChainSlug) => boolean;
  // Fetches salt + signature for the given wallet
  fetch: (contractAddress: string, walletAddress: string, chainSlug: MintChainSlug) => Promise<MintTicket | null>;
}

// Probe a URL that may return { salt, signature } or { salt, sig } or { ticket: { salt, sig } }
async function probeTicketUrl(url: string, body?: Record<string, string>): Promise<MintTicket | null> {
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;

    // Normalize various response shapes
    const nested = (data.ticket ?? data.data ?? data) as Record<string, unknown>;
    const salt = (nested.salt ?? data.salt) as string | undefined;
    const sig = (nested.signature ?? nested.sig ?? data.signature ?? data.sig) as string | undefined;

    if (!salt || !sig) return null;
    return {
      salt: (salt.startsWith("0x") ? salt : `0x${salt}`) as `0x${string}`,
      signature: (sig.startsWith("0x") ? sig : `0x${sig}`) as `0x${string}`,
      source: url,
    };
  } catch {
    return null;
  }
}

const TICKET_PROVIDERS: TicketProvider[] = [
  // ── ASCII CATS (Robinhood Chain) ─────────────────────────────────────────
  {
    name: "ascii-cats",
    matches: (addr, chain) =>
      chain === "robinhood" &&
      addr.toLowerCase() === "0xa3f56adb32d3a8f3b41462e3fbf17f36829325be",
    fetch: async (_contract, wallet, _chain) => {
      // Try known patterns for the ASCII CATS API
      const attempts = [
        () => probeTicketUrl(`https://asciicats.xyz/api/mint?address=${wallet}`),
        () => probeTicketUrl(`https://asciicats.xyz/api/mint-ticket?address=${wallet}`),
        () => probeTicketUrl(`https://asciicats.xyz/api/ticket?address=${wallet}`),
        () => probeTicketUrl("https://asciicats.xyz/api/mint", { address: wallet }),
        () => probeTicketUrl("https://asciicats.xyz/api/mint-ticket", { address: wallet }),
        () => probeTicketUrl(`https://api.asciicats.xyz/mint?address=${wallet}`),
        () => probeTicketUrl(`https://api.asciicats.xyz/ticket?address=${wallet}`),
        () => probeTicketUrl("https://api.asciicats.xyz/mint", { address: wallet }),
      ];
      for (const attempt of attempts) {
        const ticket = await attempt();
        if (ticket) return ticket;
      }
      return null;
    },
  },

  // ── Generic: probe common patterns for ANY signature-based mint ────────────
  {
    name: "generic-signature",
    matches: (_addr, _chain) => true, // always try as last resort
    fetch: async (contract, wallet, _chain) => {
      // Try to find a mint API by probing common URL patterns
      // We use the contract address to guess the project domain via Blockscout metadata
      const attempts = [
        // Generic API patterns that many projects use
        () => probeTicketUrl(`https://api.${contract.toLowerCase()}.xyz/mint?address=${wallet}`),
        () => probeTicketUrl(`https://mint.robinhood.com/api/ticket?contract=${contract}&address=${wallet}`),
        () => probeTicketUrl(`https://app.robinhood.com/nft/mint-ticket?contract=${contract}&address=${wallet}`),
        // Robinhood-native NFT API (if they have one)
        () => probeTicketUrl(`https://api.robinhood.com/nft/mint?contract=${contract}&address=${wallet}`),
        () => probeTicketUrl(
          `https://api.robinhood.com/nft/ticket`,
          { contract, address: wallet }
        ),
      ];
      for (const attempt of attempts) {
        const ticket = await attempt();
        if (ticket) return ticket;
      }
      return null;
    },
  },
];

// Main entry: try all matching providers for a signature-based mint
export async function fetchMintTicket(
  contractAddress: string,
  walletAddress: string,
  chainSlug: MintChainSlug,
): Promise<MintTicket | null> {
  const providers = TICKET_PROVIDERS.filter((p) => p.matches(contractAddress, chainSlug));
  for (const provider of providers) {
    try {
      const ticket = await provider.fetch(contractAddress, walletAddress, chainSlug);
      if (ticket) return ticket;
    } catch {
      // provider failed — try next
    }
  }
  return null;
}

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
  "function salePrice() view returns (uint256)",
  "function pricePerToken() view returns (uint256)",
  "function pricePerMint() view returns (uint256)",
  "function getPrice() view returns (uint256)",
  "function publicPrice() view returns (uint256)",
  "function publicMintPrice() view returns (uint256)",
  "function tokenPrice() view returns (uint256)",
  "function TOKEN_PRICE() view returns (uint256)",
  "function MINT_PRICE() view returns (uint256)",
  "function mintCost() view returns (uint256)",
  "function mintFee() view returns (uint256)",
  "function fee() view returns (uint256)",
  "function weiCostPerToken() view returns (uint256)",
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
  // ABI-based function detection
  mintFunctions: DetectedMintFn[];   // candidate mint functions found in ABI
  abiSource: "explorer" | "fallback"; // where the ABI came from
}

// ��── Error classification (from MINTER's classify_mint_error) ─────────────────
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

  // Fetch code + ABI in parallel
  const [code, abiResult] = await Promise.all([
    publicClient.getCode({ address: addr }),
    fetchContractAbi(contractAddress, chainSlug),
  ]);

  const mintFunctions = abiResult.abi ? detectMintFunctionsFromAbi(abiResult.abi) : [];

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
      mintFunctions: [],
      abiSource: "fallback",
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

  // ── Mint price detection ──────────────────────────────────────────────────
  // Strategy: raw eth_call with 4-byte selectors.
  // This works on BOTH verified and unverified contracts — no ABI needed.
  // If the selector exists on the contract, the RPC returns a 32-byte result.
  // A non-zero 32-byte result means the contract has a price function.
  //
  // Selectors pre-computed via keccak256(sig).slice(0,4):
  const PRICE_SELECTORS: Array<{ name: string; selector: `0x${string}` }> = [
    { name: "price()",              selector: "0xa035b1fe" },
    { name: "mintPrice()",          selector: "0x6817c76c" },
    { name: "cost()",               selector: "0x13faede6" },
    { name: "PRICE()",              selector: "0x26a4e8d2" },
    { name: "publicSalePrice()",    selector: "0x4c9e52e2" },
    { name: "salePrice()",          selector: "0x6188d845" },
    { name: "pricePerToken()",      selector: "0x83a9e049" },
    { name: "pricePerMint()",       selector: "0xd6d1ee14" },
    { name: "getPrice()",           selector: "0x98d5fdca" },
    { name: "publicPrice()",        selector: "0x99288dbb" },
    { name: "publicMintPrice()",    selector: "0x4e1ac052" },
    { name: "tokenPrice()",         selector: "0xc9b298f1" },
    { name: "MINT_PRICE()",         selector: "0xb8a8c08c" },
    { name: "mintCost()",           selector: "0xd9d98ce4" },
    { name: "mintFee()",            selector: "0x8d859f31" },
    { name: "fee()",                selector: "0xddca3f43" },
    { name: "weiCostPerToken()",    selector: "0x0f7309e8" },
    { name: "TOKEN_PRICE()",        selector: "0x56bc13a8" },
    { name: "pricePublic()",        selector: "0x55367ba9" },
    { name: "publicMintCost()",     selector: "0x4f6c7c96" },
  ];

  // If ABI is verified, also add functions from ABI that look like price getters
  // (zero-arg view/pure, returns uint256, name contains price keyword)
  const priceKeywords = ["price", "cost", "fee", "mint", "sale", "token", "wei"];
  const extraFromAbi: Array<{ name: string; selector: `0x${string}` }> = [];
  if (abiResult.abi) {
    for (const item of abiResult.abi as Array<{ type: string; name: string; inputs: unknown[]; outputs: Array<{ type: string }>; stateMutability: string }>) {
      if (
        item.type === "function" &&
        (item.stateMutability === "view" || item.stateMutability === "pure") &&
        item.inputs.length === 0 &&
        item.outputs?.length === 1 &&
        item.outputs[0].type === "uint256" &&
        priceKeywords.some((kw) => item.name.toLowerCase().includes(kw)) &&
        !PRICE_SELECTORS.some((s) => s.name === `${item.name}()`)
      ) {
        // Compute selector via keccak256
        try {
          const { keccak256, toBytes } = await import("viem");
          const sel = keccak256(toBytes(`${item.name}()`)).slice(0, 10) as `0x${string}`;
          extraFromAbi.push({ name: `${item.name}()`, selector: sel });
        } catch {}
      }
    }
  }

  const allPriceSelectors = [...extraFromAbi, ...PRICE_SELECTORS];

  let mintPriceWei = 0n;
  for (const { selector } of allPriceSelectors) {
    try {
      const raw = await publicClient.call({ to: addr, data: selector });
      if (raw.data && raw.data !== "0x" && raw.data.length >= 66) {
        const val = BigInt(raw.data);
        if (val > 0n) {
          mintPriceWei = val;
          break;
        }
        // val === 0n means function exists but returns 0 (free mint) — keep probing
        // in case another function has the real price
      }
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
    mintFunctions,
    abiSource: abiResult.source,
  };
}

// ─── WL eligibility check ───────────────���─────────────────────────────────────
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
  gasWithBuffer: string;
  detectedFn?: string;
  errorMessage?: string;
  errorType?: "fatal" | "retryable";
  mintType?: MintType;
  needsTicket?: boolean;   // true = signature-based but no API endpoint found yet
  ticketSource?: string;   // URL that provided the ticket (for debugging)
}

// All mint function candidates for fallback probing — ordered by prevalence.
// Each entry includes the 4-byte selector (keccak256 of signature) for raw probing.
// Selectors verified at: https://www.4byte.directory/
const SIM_ATTEMPTS: Array<{
  sig: string;             // full signature e.g. "mint(uint256)"
  selector: `0x${string}`; // 4-byte selector
  buildCalldata: (qty: bigint, from: `0x${string}`) => `0x${string}`;
  buildArgs: (qty: bigint, from: `0x${string}`) => unknown[];
  payable: boolean;
}> = [
  {
    sig: "mint(uint256)", selector: "0xa0712d68",
    buildCalldata: (qty, _) => `0xa0712d68${qty.toString(16).padStart(64, "0")}` as `0x${string}`,
    buildArgs: (qty, _) => [qty],
    payable: true,
  },
  {
    sig: "mint()", selector: "0x1249c58b",
    buildCalldata: (_, __) => "0x1249c58b" as `0x${string}`,
    buildArgs: (_, __) => [],
    payable: true,
  },
  {
    sig: "publicMint(uint256)", selector: "0x2db11544",
    buildCalldata: (qty, _) => `0x2db11544${qty.toString(16).padStart(64, "0")}` as `0x${string}`,
    buildArgs: (qty, _) => [qty],
    payable: true,
  },
  {
    sig: "mintPublic(uint256)", selector: "0xe5a7e6f4",
    buildCalldata: (qty, _) => `0xe5a7e6f4${qty.toString(16).padStart(64, "0")}` as `0x${string}`,
    buildArgs: (qty, _) => [qty],
    payable: true,
  },
  {
    sig: "mint(address,uint256)", selector: "0x40c10f19",
    buildCalldata: (qty, from) => `0x40c10f19${from.slice(2).padStart(64, "0")}${qty.toString(16).padStart(64, "0")}` as `0x${string}`,
    buildArgs: (qty, from) => [from, qty],
    payable: true,
  },
  {
    sig: "safeMint(address)", selector: "0x40d097c3",
    buildCalldata: (_, from) => `0x40d097c3${from.slice(2).padStart(64, "0")}` as `0x${string}`,
    buildArgs: (_, from) => [from],
    payable: false,
  },
  {
    sig: "mintTo(address,uint256)", selector: "0x449a52f8",
    buildCalldata: (qty, from) => `0x449a52f8${from.slice(2).padStart(64, "0")}${qty.toString(16).padStart(64, "0")}` as `0x${string}`,
    buildArgs: (qty, from) => [from, qty],
    payable: true,
  },
  {
    sig: "claim(uint256)", selector: "0x379607f5",
    buildCalldata: (qty, _) => `0x379607f5${qty.toString(16).padStart(64, "0")}` as `0x${string}`,
    buildArgs: (qty, _) => [qty],
    payable: true,
  },
  {
    sig: "freeMint()", selector: "0x1b2ef1ca",
    buildCalldata: (_, __) => "0x1b2ef1ca" as `0x${string}`,
    buildArgs: (_, __) => [],
    payable: false,
  },
];

// Build args array for a detected mint function
function buildMintArgs(
  fn: DetectedMintFn,
  qty: bigint,
  from: `0x${string}`,
): unknown[] {
  return fn.inputs.map((input) => {
    const t = input.type;
    const n = (input.name ?? "").toLowerCase();
    if (t.startsWith("uint") || t.startsWith("int")) {
      // quantity-like param
      if (n.includes("qty") || n.includes("quantity") || n.includes("amount") || n.includes("count") || n.includes("num")) {
        return qty;
      }
      return qty; // default: treat as quantity
    }
    if (t === "address") return from;
    if (t === "bool") return true;
    return qty; // fallback
  });
}

export async function simulateMint(
  contractAddress: string,
  quantity: number,
  mintPriceWei: bigint,
  walletAddress: string,
  chainSlug: MintChainSlug = "robinhood",
  // Optional: pre-fetched mint functions from ABI (avoids refetching)
  mintFunctions?: DetectedMintFn[],
  // Optional: override which function to try first
  overrideFnSignature?: string,
  // Optional: pre-fetched mint ticket (for signature-based mints)
  mintTicket?: MintTicket,
): Promise<SimulateResult> {
  const publicClient = chainSlug === "robinhood"
    ? getPublicClient()
    : getPublicClientForChain(chainSlug);
  const addr = contractAddress as `0x${string}`;
  const from = walletAddress as `0x${string}`;
  const totalValue = mintPriceWei * BigInt(quantity);
  const qty = BigInt(quantity);

  // ── Strategy 1: use verified ABI functions if available ───────────────────
  let abiFunctions = mintFunctions ?? [];

  // Fetch ABI if not provided
  if (abiFunctions.length === 0) {
    const abiResult = await fetchContractAbi(contractAddress, chainSlug);
    if (abiResult.abi) {
      abiFunctions = detectMintFunctionsFromAbi(abiResult.abi);
    }
  }

  // If override specified, put that function first
  if (overrideFnSignature && abiFunctions.length > 0) {
    abiFunctions = [
      ...abiFunctions.filter((f) => f.signature === overrideFnSignature),
      ...abiFunctions.filter((f) => f.signature !== overrideFnSignature),
    ];
  }

  // Try each ABI-derived function
  for (const fn of abiFunctions) {
    // ── Signature-based mints: need salt + sig from project API ──────────────
    if (fn.mintType === "signature") {
      // Fetch or reuse ticket
      const ticket = mintTicket ?? await fetchMintTicket(contractAddress, walletAddress, chainSlug);
      if (!ticket) {
        // API endpoint not found — can't simulate this function yet
        return {
          success: false,
          gasEstimate: "0",
          gasWithBuffer: "0",
          errorMessage: `This contract uses a server-signed mint (${fn.signature}). The project API endpoint was not found automatically. Please wait for the project to open minting — the ticket endpoint will be discovered once it's live.`,
          errorType: "retryable",
          mintType: "signature",
          needsTicket: true,
        };
      }
      // Inject ticket into args: map inputs to correct values
      const ticketArgs = fn.inputs.map((inp) => {
        const t = inp.type;
        const n = (inp.name ?? "").toLowerCase();
        if (t === "bytes32") return ticket.salt;
        if (t === "bytes") return ticket.signature;
        if (t.startsWith("uint") || t.startsWith("int")) return qty;
        if (t === "address") return from;
        return qty;
      });
      const fnAbi = parseAbi([
        `function ${fn.signature}${fn.payable ? " payable" : ""}` as `function ${string}`,
      ]);
      try {
        const gas = await publicClient.estimateContractGas({
          address: addr, abi: fnAbi, functionName: fn.name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          args: ticketArgs as any, account: from,
          value: fn.payable ? totalValue : 0n,
        });
        const gasWithBuffer = BigInt(Math.ceil(Number(gas) * 1.25));
        return {
          success: true,
          gasEstimate: gas.toString(),
          gasWithBuffer: gasWithBuffer.toString(),
          detectedFn: fn.signature,
          mintType: "signature",
          ticketSource: ticket.source,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // "bad ticket" or "1-IP" = mint is paused or we need to wait
        if (msg.toLowerCase().includes("bad ticket") || msg.toLowerCase().includes("ip")) {
          return {
            success: false, gasEstimate: "0", gasWithBuffer: "0",
            errorMessage: `Mint ticket obtained from ${ticket.source} but was rejected: ${msg.slice(0, 160)}. The mint may still be paused or the IP check may be blocking server requests.`,
            errorType: "retryable", mintType: "signature",
          };
        }
        return {
          success: false, gasEstimate: "0", gasWithBuffer: "0",
          errorMessage: msg.slice(0, 240), errorType: classifyMintError(msg),
          mintType: "signature",
        };
      }
    }

    // ── Standard open mints ───────────────────────────────────────────────────
    const args = buildMintArgs(fn, qty, from);
    const fnAbi = parseAbi([
      `function ${fn.signature}${fn.payable ? " payable" : ""}` as `function ${string}`,
    ]);
    try {
      const gas = await publicClient.estimateContractGas({
        address: addr,
        abi: fnAbi,
        functionName: fn.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: args as any,
        account: from,
        value: fn.payable ? totalValue : 0n,
      });
      const gasWithBuffer = BigInt(Math.ceil(Number(gas) * 1.25));
      return {
        success: true,
        gasEstimate: gas.toString(),
        gasWithBuffer: gasWithBuffer.toString(),
        detectedFn: fn.signature,
        mintType: fn.mintType,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorType = classifyMintError(msg);
      if (errorType === "fatal") {
        return { success: false, gasEstimate: "0", gasWithBuffer: "0", errorMessage: msg.slice(0, 240), errorType: "fatal" };
      }
      const isSelectorMiss =
        msg.includes("does not exist on the contract") ||
        msg.includes("Function not found") ||
        msg.includes("invalid selector");
      if (!isSelectorMiss) {
        return { success: false, gasEstimate: "0", gasWithBuffer: "0", errorMessage: msg.slice(0, 240), errorType: "retryable" };
      }
    }
  }

  // ── Strategy 2: raw selector probing ────────────────────────────────────────
  // The fundamental problem with estimateContractGas-based probing: both
  // "selector doesn't exist" and "call reverted" produce similar-looking errors,
  // making it impossible to tell if we have the wrong signature or the right one
  // that failed for a business reason.
  //
  // Solution: first use eth_call with each selector to classify the response:
  //   - RPC error "invalid opcode" / empty data → selector exists (EVM dispatched it)
  //   - Any result / non-empty revert data → selector exists
  //   - Revert with NO data (0x) AND we got no valid return → may be missing OR may be a payable check
  //
  // Then once we find a selector that the EVM dispatched, estimate gas with the
  // correct value so we can confirm it'll succeed.
  let lastMsg = "";

  // First pass: probe all selectors in parallel to find which ones exist
  const probeResults = await Promise.all(
    SIM_ATTEMPTS.map(async (attempt) => {
      try {
        const calldata = attempt.buildCalldata(qty, from);
        // Use eth_call with value to simulate payable functions too
        await publicClient.call({
          to: addr,
          data: calldata,
          account: from,
          value: totalValue,
        });
        // If eth_call succeeds (or doesn't throw) — selector definitely exists
        return { attempt, exists: true, revertMsg: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // "execution reverted" means the selector EXISTS — EVM dispatched it
        // but the call failed (wrong value, not started, etc.)
        const selectorExists =
          msg.includes("execution reverted") ||
          msg.includes("revert") ||
          msg.includes("Reverted") ||
          // viem ContractFunctionExecutionError wraps the EVM revert
          msg.includes("ContractFunctionExecutionError");

        return { attempt, exists: selectorExists, revertMsg: msg };
      }
    })
  );

  // Second pass: for found selectors, try estimateContractGas with exact ABI
  for (const probe of probeResults) {
    if (!probe.exists) continue;

    const { attempt } = probe;
    const fnAbi = parseAbi([
      `function ${attempt.sig}${attempt.payable ? " payable" : ""}` as `function ${string}`,
    ]);
    const fnName = attempt.sig.split("(")[0];

    try {
      const gas = await publicClient.estimateContractGas({
        address: addr,
        abi: fnAbi,
        functionName: fnName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: attempt.buildArgs(qty, from) as any,
        account: from,
        value: attempt.payable ? totalValue : 0n,
      });
      const gasWithBuffer = BigInt(Math.ceil(Number(gas) * 1.25));
      return {
        success: true,
        gasEstimate: gas.toString(),
        gasWithBuffer: gasWithBuffer.toString(),
        detectedFn: attempt.sig,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastMsg = msg;
      const errorType = classifyMintError(msg);
      if (errorType === "fatal") {
        return { success: false, gasEstimate: "0", gasWithBuffer: "0", errorMessage: msg.slice(0, 240), errorType: "fatal" };
      }
      // Retryable — store message and try next found selector
    }
  }

  return {
    success: false,
    gasEstimate: "0",
    gasWithBuffer: "0",
    errorMessage: lastMsg
      ? `No mint function succeeded. Last error: ${lastMsg.slice(0, 160)}`
      : "No compatible mint function found. Contract ABI is unverified and no known signature matched.",
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
  // If provided (from prior simulate), use this exact function signature
  detectedFn?: string;
  // ABI-derived mint functions (from prior detect/simulate) — used to know mintType
  mintFunctions?: DetectedMintFn[];
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

    type WriteFn = () => Promise<`0x${string}`>;
    const qty = BigInt(params.quantity);

    // Check if detectedFn is a signature-based mint (from ABI mintFunctions)
    const detectedFnInfo = params.detectedFn
      ? params.mintFunctions?.find((f) => f.signature === params.detectedFn)
      : undefined;

    // ── Signature-based mint: fetch ticket and build single write fn ──────────
    if (detectedFnInfo?.mintType === "signature") {
      const ticket = await fetchMintTicket(params.contractAddress, account.address, slug);
      if (!ticket) {
        throw new Error(
          `Signature-based mint requires a ticket from the project API. ` +
          `The API endpoint for ${params.contractAddress} was not found. ` +
          `Please wait for the project to go live or check the project website.`
        );
      }
      const ticketArgs = detectedFnInfo.inputs.map((inp) => {
        const t = inp.type;
        if (t === "bytes32") return ticket.salt;
        if (t === "bytes") return ticket.signature;
        if (t.startsWith("uint") || t.startsWith("int")) return qty;
        if (t === "address") return account.address as `0x${string}`;
        return qty;
      });
      const fnAbi = parseAbi([
        `function ${detectedFnInfo.signature}${detectedFnInfo.payable ? " payable" : ""}` as `function ${string}`,
      ]);
      const txHash = await walletClient.writeContract({
        address: addr,
        abi: fnAbi,
        functionName: detectedFnInfo.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: ticketArgs as any,
        value: detectedFnInfo.payable ? totalValue : 0n,
        ...gasOverrides,
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash, confirmations: 1, timeout: 30_000,
      });
      return { txHash, gasUsed: receipt.gasUsed.toString() };
    }

    // ── Standard open mints: try all SIM_ATTEMPTS ─────────────────────────────
    // If detectedFn is provided, put it first.
    const orderedAttempts = params.detectedFn
      ? [
          ...SIM_ATTEMPTS.filter((a) => a.sig === params.detectedFn),
          ...SIM_ATTEMPTS.filter((a) => a.sig !== params.detectedFn),
        ]
      : SIM_ATTEMPTS;

    const mintAttempts: WriteFn[] = orderedAttempts.map((attempt) => () => {
      const sig = attempt.sig;
      const fnName = sig.split("(")[0];
      const callArgs = attempt.buildArgs(qty, account.address);
      const fnAbi = parseAbi([
        `function ${sig}${attempt.payable ? " payable" : ""}` as `function ${string}`,
      ]);
      return walletClient.writeContract({
        address: addr,
        abi: fnAbi,
        functionName: fnName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        args: callArgs as any,
        value: attempt.payable ? totalValue : 0n,
        ...gasOverrides,
      });
    });

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
