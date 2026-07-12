import { parseAbi, parseUnits, formatUnits, type PublicClient, type WalletClient, type Account } from "viem";
import { CONTRACTS, getPublicClient, getWalletClient } from "./chain";

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const V3_FACTORY_ABI = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
]);

const V3_POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
]);

// Use JSON ABI format for functions with tuple params — parseAbi does not
// support named tuple params (abitype limitation).
const V3_NPM_ABI = [
  {
    name: "mint",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    name: "positions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
  {
    name: "decreaseLiquidity",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "liquidity", type: "uint128" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    name: "collect",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenId", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "amount0Max", type: "uint128" },
          { name: "amount1Max", type: "uint128" },
        ],
      },
    ],
    outputs: [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "tokenOfOwnerByIndex",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── Fee tiers ────────────────────────────────────────────────────────────────
export const FEE_TIERS = [100, 500, 3000, 10000] as const;
export type FeeTier = typeof FEE_TIERS[number];

// ─── Tick math helpers ────────────────────────────────────────────────────────
export function nearestUsableTick(tick: number, tickSpacing: number): number {
  const rounded = Math.round(tick / tickSpacing) * tickSpacing;
  return rounded;
}

export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

export function priceToTick(price: number): number {
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

export function sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
  const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
  return sqrtPrice * sqrtPrice;
}

// ─── Pool info ────────────────────────────────────────────────────────────────
export interface V3PoolInfo {
  address: string;
  token0: string;
  token1: string;
  fee: number;
  tickSpacing: number;
  sqrtPriceX96: bigint;
  currentTick: number;
  currentPrice: number;
  liquidity: bigint;
}

export async function getV3Pool(
  tokenA: string,
  tokenB: string,
  fee: FeeTier
): Promise<V3PoolInfo | null> {
  const publicClient = getPublicClient();

  try {
    const poolAddress = await publicClient.readContract({
      address: CONTRACTS.UNISWAP_V3_FACTORY,
      abi: V3_FACTORY_ABI,
      functionName: "getPool",
      args: [tokenA as `0x${string}`, tokenB as `0x${string}`, fee],
    });

    if (poolAddress === "0x0000000000000000000000000000000000000000") {
      return null;
    }

    const [slot0, liquidity, token0Addr, token1Addr, tickSpacing] =
      await Promise.all([
        publicClient.readContract({ address: poolAddress, abi: V3_POOL_ABI, functionName: "slot0" }),
        publicClient.readContract({ address: poolAddress, abi: V3_POOL_ABI, functionName: "liquidity" }),
        publicClient.readContract({ address: poolAddress, abi: V3_POOL_ABI, functionName: "token0" }),
        publicClient.readContract({ address: poolAddress, abi: V3_POOL_ABI, functionName: "token1" }),
        publicClient.readContract({ address: poolAddress, abi: V3_POOL_ABI, functionName: "tickSpacing" }),
      ]);

    const [sqrtPriceX96, currentTick] = slot0;

    return {
      address: poolAddress,
      token0: token0Addr,
      token1: token1Addr,
      fee,
      tickSpacing: Number(tickSpacing),
      sqrtPriceX96,
      currentTick: Number(currentTick),
      currentPrice: sqrtPriceX96ToPrice(sqrtPriceX96),
      liquidity,
    };
  } catch {
    return null;
  }
}

// ─── Add Liquidity v3 ─────────────────────────────────────────────────────────
export interface AddLiquidityV3Params {
  token0: string;
  token1: string;
  fee: FeeTier;
  amount0: string; // human-readable
  amount1: string; // human-readable
  tickLower: number;
  tickUpper: number;
  slippageBps?: number; // basis points, default 50 = 0.5%
  privateKey: `0x${string}`;
  recipientAddress: string;
}

export async function addLiquidityV3(params: AddLiquidityV3Params): Promise<{
  txHash: string;
  tokenId: string;
}> {
  const publicClient = getPublicClient();
  const { client: walletClient, account } = getWalletClient(params.privateKey);
  const slippageBps = params.slippageBps ?? 50;

  // Fetch decimals
  const [dec0, dec1] = await Promise.all([
    publicClient.readContract({ address: params.token0 as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }),
    publicClient.readContract({ address: params.token1 as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" }),
  ]);

  const amount0Desired = parseUnits(params.amount0, dec0);
  const amount1Desired = parseUnits(params.amount1, dec1);
  const slippageMul = BigInt(10000 - slippageBps);
  const amount0Min = (amount0Desired * slippageMul) / 10000n;
  const amount1Min = (amount1Desired * slippageMul) / 10000n;

  // Approve token0 and token1
  for (const [tokenAddr, amountDesired] of [
    [params.token0, amount0Desired],
    [params.token1, amount1Desired],
  ] as [string, bigint][]) {
    const allowance = await publicClient.readContract({
      address: tokenAddr as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, CONTRACTS.UNISWAP_V3_NPM],
    });
    if (allowance < amountDesired) {
      const approveTx = await walletClient.writeContract({
        address: tokenAddr as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.UNISWAP_V3_NPM, amountDesired],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const mintTx = await walletClient.writeContract({
    address: CONTRACTS.UNISWAP_V3_NPM,
    abi: V3_NPM_ABI,
    functionName: "mint",
    args: [
      {
        token0: params.token0 as `0x${string}`,
        token1: params.token1 as `0x${string}`,
        fee: params.fee,
        tickLower: params.tickLower,
        tickUpper: params.tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        recipient: params.recipientAddress as `0x${string}`,
        deadline,
      },
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: mintTx });

  // Parse Transfer event for tokenId
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const mintLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === CONTRACTS.UNISWAP_V3_NPM.toLowerCase() &&
      log.topics[0] === transferTopic
  );
  const tokenId = mintLog?.topics[3]
    ? BigInt(mintLog.topics[3]).toString()
    : "unknown";

  return { txHash: mintTx, tokenId };
}

// ─── Remove Liquidity v3 ──────────────────────────────────────────────────────
export async function removeLiquidityV3(params: {
  tokenId: string;
  percentToRemove?: number; // 1-100, default 100
  privateKey: `0x${string}`;
  recipientAddress: string;
}): Promise<{ txHash: string; amount0: string; amount1: string }> {
  const publicClient = getPublicClient();
  const { client: walletClient, account } = getWalletClient(params.privateKey);
  const percent = params.percentToRemove ?? 100;

  const position = await publicClient.readContract({
    address: CONTRACTS.UNISWAP_V3_NPM,
    abi: V3_NPM_ABI,
    functionName: "positions",
    args: [BigInt(params.tokenId)],
  });

  const liquidity = (position[7] * BigInt(percent)) / 100n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const decreaseTx = await walletClient.writeContract({
    address: CONTRACTS.UNISWAP_V3_NPM,
    abi: V3_NPM_ABI,
    functionName: "decreaseLiquidity",
    args: [
      {
        tokenId: BigInt(params.tokenId),
        liquidity,
        amount0Min: 0n,
        amount1Min: 0n,
        deadline,
      },
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: decreaseTx });

  const collectTx = await walletClient.writeContract({
    address: CONTRACTS.UNISWAP_V3_NPM,
    abi: V3_NPM_ABI,
    functionName: "collect",
    args: [
      {
        tokenId: BigInt(params.tokenId),
        recipient: params.recipientAddress as `0x${string}`,
        amount0Max: BigInt("340282366920938463463374607431768211455"),
        amount1Max: BigInt("340282366920938463463374607431768211455"),
      },
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: collectTx });

  return {
    txHash: collectTx,
    amount0: "0", // would need event parsing for exact amounts
    amount1: "0",
  };
}

// ─── Collect fees v3 ──────────────────────────────────────────────────────────
export async function collectFeesV3(params: {
  tokenId: string;
  privateKey: `0x${string}`;
  recipientAddress: string;
}): Promise<{ txHash: string }> {
  const publicClient = getPublicClient();
  const { client: walletClient } = getWalletClient(params.privateKey);

  const collectTx = await walletClient.writeContract({
    address: CONTRACTS.UNISWAP_V3_NPM,
    abi: V3_NPM_ABI,
    functionName: "collect",
    args: [
      {
        tokenId: BigInt(params.tokenId),
        recipient: params.recipientAddress as `0x${string}`,
        amount0Max: BigInt("340282366920938463463374607431768211455"),
        amount1Max: BigInt("340282366920938463463374607431768211455"),
      },
    ],
  });

  await publicClient.waitForTransactionReceipt({ hash: collectTx });
  return { txHash: collectTx };
}

// ─── Get user positions ───────────────────────────────────────────────────────
export async function getUserV3Positions(walletAddress: string): Promise<
  { tokenId: string; token0: string; token1: string; fee: number; liquidity: bigint; tickLower: number; tickUpper: number }[]
> {
  const publicClient = getPublicClient();

  try {
    const balance = await publicClient.readContract({
      address: CONTRACTS.UNISWAP_V3_NPM,
      abi: V3_NPM_ABI,
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    });

    const positions = [];
    for (let i = 0n; i < balance; i++) {
      const tokenId = await publicClient.readContract({
        address: CONTRACTS.UNISWAP_V3_NPM,
        abi: V3_NPM_ABI,
        functionName: "tokenOfOwnerByIndex",
        args: [walletAddress as `0x${string}`, i],
      });

      const pos = await publicClient.readContract({
        address: CONTRACTS.UNISWAP_V3_NPM,
        abi: V3_NPM_ABI,
        functionName: "positions",
        args: [tokenId],
      });

      if (pos[7] > 0n) {
        positions.push({
          tokenId: tokenId.toString(),
          token0: pos[2],
          token1: pos[3],
          fee: pos[4],
          tickLower: pos[5],
          tickUpper: pos[6],
          liquidity: pos[7],
        });
      }
    }

    return positions;
  } catch {
    return [];
  }
}
