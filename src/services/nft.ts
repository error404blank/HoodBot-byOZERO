import { parseAbi, parseEther } from "viem";
import { getPublicClient, getWalletClient } from "./chain";

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

// Common mint function signatures used by most NFT projects
const MINT_ABI = parseAbi([
  "function mint(uint256 quantity) payable",
  "function mint(address to, uint256 quantity) payable",
  "function publicMint(uint256 quantity) payable",
  "function mintPublic(uint256 quantity) payable",
  "function safeMint(address to) payable",
  "function mintTo(address recipient, uint256 count) payable",
]);

// Common price functions
const PRICE_ABI = parseAbi([
  "function price() view returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function cost() view returns (uint256)",
  "function PRICE() view returns (uint256)",
  "function publicSalePrice() view returns (uint256)",
]);

// ─── Contract detection ───────────────────────────────────────────────────────
export type NftStandard = "ERC721" | "ERC1155" | "UNKNOWN";

export interface NftContractInfo {
  address: string;
  standard: NftStandard;
  name: string;
  symbol: string;
  totalSupply: string;
  maxSupply: string;
  mintPrice: string; // in ETH
  isLive: boolean;
  hasCode: boolean;
}

export async function detectNftContract(
  contractAddress: string
): Promise<NftContractInfo> {
  const publicClient = getPublicClient();
  const addr = contractAddress as `0x${string}`;

  // Check if contract exists
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
      isLive: false,
      hasCode: false,
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

  try {
    name = await publicClient.readContract({ address: addr, abi: ERC721_ABI, functionName: "name" });
  } catch {}
  try {
    symbol = await publicClient.readContract({ address: addr, abi: ERC721_ABI, functionName: "symbol" });
  } catch {}
  try {
    const ts = await publicClient.readContract({ address: addr, abi: ERC721_ABI, functionName: "totalSupply" });
    totalSupply = ts.toString();
  } catch {}
  try {
    const ms = await publicClient.readContract({ address: addr, abi: ERC721_ABI, functionName: "maxSupply" });
    maxSupply = ms.toString();
  } catch {}

  // Try reading mint price
  let mintPriceWei = 0n;
  const priceFns = ["price", "mintPrice", "cost", "PRICE", "publicSalePrice"] as const;
  for (const fn of priceFns) {
    try {
      const result = await publicClient.readContract({
        address: addr,
        abi: PRICE_ABI,
        functionName: fn,
      });
      mintPriceWei = result;
      break;
    } catch {}
  }

  const mintPrice = (Number(mintPriceWei) / 1e18).toFixed(6);
  const isLive = standard !== "UNKNOWN";

  return {
    address: contractAddress,
    standard,
    name: name || "Unknown Collection",
    symbol: symbol || "NFT",
    totalSupply,
    maxSupply,
    mintPrice,
    isLive,
    hasCode: true,
  };
}

// ─── Mint NFT ─────────────────────────────────────────────────────────────────
export interface MintNftParams {
  contractAddress: string;
  quantity: number;
  mintPrice: string; // in ETH per token
  privateKey: `0x${string}`;
  recipientAddress: string;
}

export async function mintNft(params: MintNftParams): Promise<{ txHash: string }> {
  const publicClient = getPublicClient();
  const { client: walletClient, account } = getWalletClient(params.privateKey);
  const addr = params.contractAddress as `0x${string}`;
  const totalValue = parseEther(
    (parseFloat(params.mintPrice) * params.quantity).toFixed(18)
  );

  // Try common mint function signatures in order
  const mintAttempts: Array<() => Promise<`0x${string}`>> = [
    () =>
      walletClient.writeContract({
        address: addr,
        abi: MINT_ABI,
        functionName: "mint",
        args: [BigInt(params.quantity)],
        value: totalValue,
      }),
    () =>
      walletClient.writeContract({
        address: addr,
        abi: MINT_ABI,
        functionName: "publicMint",
        args: [BigInt(params.quantity)],
        value: totalValue,
      }),
    () =>
      walletClient.writeContract({
        address: addr,
        abi: MINT_ABI,
        functionName: "mintPublic",
        args: [BigInt(params.quantity)],
        value: totalValue,
      }),
    () =>
      walletClient.writeContract({
        address: addr,
        abi: MINT_ABI,
        functionName: "mint",
        args: [account.address, BigInt(params.quantity)],
        value: totalValue,
      }),
    () =>
      walletClient.writeContract({
        address: addr,
        abi: MINT_ABI,
        functionName: "safeMint",
        args: [account.address],
        value: totalValue,
      }),
  ];

  let lastError: unknown;
  for (const attempt of mintAttempts) {
    try {
      const txHash = await attempt();
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `All mint function signatures failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

/** Format contract info for Telegram display */
export function formatContractInfo(info: NftContractInfo): string {
  const lines = [
    `Collection: ${info.name} (${info.symbol})`,
    `Standard: ${info.standard}`,
    `Address: ${info.address.slice(0, 8)}...${info.address.slice(-6)}`,
    `Total Supply: ${info.totalSupply}${info.maxSupply !== "0" ? ` / ${info.maxSupply}` : ""}`,
    `Mint Price: ${parseFloat(info.mintPrice) === 0 ? "Free" : `${info.mintPrice} ETH`}`,
    `Status: ${info.isLive ? "Active" : "Not detected as NFT"}`,
  ];
  return lines.join("\n");
}
