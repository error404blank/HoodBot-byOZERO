import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ─── Robinhood Chain mainnet ───────────────────────────────────────────────────
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [
        process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

// ─── Known contract addresses ─────────────────────────────────────────────────
export const CONTRACTS = {
  WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as `0x${string}`,
  USDG: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as `0x${string}`,
  UNISWAP_V3_FACTORY: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA" as `0x${string}`,
  UNISWAP_V3_NPM: "0x3d79EdAaBC0EaB6F08ED885C05Fc0B014290D95A" as `0x${string}`, // NonfungiblePositionManager
  UNISWAP_V4_POOL_MANAGER: "0x8366a39CC670B4001A1121B8F6A443A643e40951" as `0x${string}`,
  UNISWAP_V4_POSITION_MANAGER: "0x1B1C77B606d13b09C84d1c7394B96b147bC03147" as `0x${string}`,
} as const;

// ─── Client factory ───────────────────────────────────────────────────────────
export function getPublicClient() {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com"),
  });
}

export function getWalletClient(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  return {
    client: createWalletClient({
      account,
      chain: robinhoodChain,
      transport: http(process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com"),
    }),
    account,
  };
}

export function getExplorerUrl(txHash: string): string {
  return `https://robinhoodchain.blockscout.com/tx/${txHash}`;
}

export function getAddressUrl(address: string): string {
  return `https://robinhoodchain.blockscout.com/address/${address}`;
}
