import { createPublicClient, createWalletClient, http, fallback, defineChain } from "viem";
import { mainnet, base, sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ─── Robinhood Chain mainnet ───────────────────────────────────────────────────
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: [process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

// ─── Supported chains for NFTHood minting ────────────────────────────────────
export const SUPPORTED_MINT_CHAINS = [
  {
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    slug: "ethereum",
    // eth.llamarpc.com is free and highly reliable
    defaultRpc: "https://eth.llamarpc.com",
    fallbackRpcs: ["https://cloudflare-eth.com", "https://rpc.ankr.com/eth"],
    explorer: "https://etherscan.io",
    viemChain: mainnet,
    isTestnet: false,
  },
  {
    id: 4663,
    name: "Robinhood Chain",
    symbol: "ETH",
    slug: "robinhood",
    defaultRpc: process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
    fallbackRpcs: ["https://rpc.mainnet.chain.robinhood.com"],
    explorer: "https://robinhoodchain.blockscout.com",
    viemChain: robinhoodChain,
    isTestnet: false,
  },
  {
    id: 8453,
    name: "Base",
    symbol: "ETH",
    slug: "base",
    defaultRpc: "https://mainnet.base.org",
    fallbackRpcs: ["https://base.llamarpc.com", "https://rpc.ankr.com/base"],
    explorer: "https://basescan.org",
    viemChain: base,
    isTestnet: false,
  },
  {
    id: 11155111,
    name: "Sepolia",
    symbol: "ETH",
    slug: "sepolia",
    // rpc.sepolia.org is unreliable (404 frequently) — use Ankr public endpoint
    defaultRpc: "https://rpc.ankr.com/eth_sepolia",
    fallbackRpcs: [
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://sepolia.drpc.org",
    ],
    explorer: "https://sepolia.etherscan.io",
    viemChain: sepolia,
    isTestnet: true,
  },
] as const;

export type MintChainSlug = (typeof SUPPORTED_MINT_CHAINS)[number]["slug"];

export function getMintChain(slug: MintChainSlug) {
  return SUPPORTED_MINT_CHAINS.find((c) => c.slug === slug) ?? SUPPORTED_MINT_CHAINS[1];
}

export function getMintChainById(chainId: number) {
  return SUPPORTED_MINT_CHAINS.find((c) => c.id === chainId) ?? SUPPORTED_MINT_CHAINS[1];
}

// ─── Known contract addresses (Robinhood Chain only) ─────────────────────────
export const CONTRACTS = {
  WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as `0x${string}`,
  USDG: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as `0x${string}`,
  UNISWAP_V3_FACTORY: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA" as `0x${string}`,
  UNISWAP_V3_NPM: "0x3d79EdAaBC0EaB6F08ED885C05Fc0B014290D95A" as `0x${string}`,
  UNISWAP_V4_POOL_MANAGER: "0x8366a39CC670B4001A1121B8F6A443A643e40951" as `0x${string}`,
  UNISWAP_V4_POSITION_MANAGER: "0x1B1C77B606d13b09C84d1c7394B96b147bC03147" as `0x${string}`,
} as const;

// ─── Default Robinhood client (for LP, existing features) ────────────────────
export function getPublicClient(rpcUrl?: string) {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl || process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com"),
  });
}

export function getWalletClient(privateKey: `0x${string}`, rpcUrl?: string) {
  const account = privateKeyToAccount(privateKey);
  return {
    client: createWalletClient({
      account,
      chain: robinhoodChain,
      transport: http(rpcUrl || process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com"),
    }),
    account,
  };
}

// ─── Multi-chain client factory (for NFTHood minting) ────────────────────────
export function getPublicClientForChain(slug: MintChainSlug, customRpcUrl?: string) {
  const chain = getMintChain(slug);
  // Build transport: custom RPC (if provided) → primary → fallbacks
  const urls = customRpcUrl
    ? [customRpcUrl]
    : [chain.defaultRpc, ...chain.fallbackRpcs];
  const transport = urls.length > 1
    ? fallback(urls.map((u) => http(u, { timeout: 10_000 })))
    : http(urls[0], { timeout: 10_000 });
  return createPublicClient({ chain: chain.viemChain, transport });
}

export function getWalletClientForChain(
  privateKey: `0x${string}`,
  slug: MintChainSlug,
  customRpcUrl?: string
) {
  const chain = getMintChain(slug);
  const urls = customRpcUrl
    ? [customRpcUrl]
    : [chain.defaultRpc, ...chain.fallbackRpcs];
  const transport = urls.length > 1
    ? fallback(urls.map((u) => http(u, { timeout: 10_000 })))
    : http(urls[0], { timeout: 10_000 });
  const account = privateKeyToAccount(privateKey);
  return {
    client: createWalletClient({ account, chain: chain.viemChain, transport }),
    account,
  };
}

// ─── Explorer helpers ─────────────────────────────────────────────────────────
export function getExplorerUrl(txHash: string, slug: MintChainSlug = "robinhood"): string {
  const chain = getMintChain(slug);
  return `${chain.explorer}/tx/${txHash}`;
}

export function getAddressUrl(address: string, slug: MintChainSlug = "robinhood"): string {
  const chain = getMintChain(slug);
  return `${chain.explorer}/address/${address}`;
}
