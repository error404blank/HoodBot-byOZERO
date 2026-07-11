import { parseAbi, parseUnits, encodeAbiParameters, keccak256 } from "viem";
import { CONTRACTS, getPublicClient, getWalletClient } from "./chain";

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const V4_POOL_MANAGER_ABI = parseAbi([
  "function getSlot0(bytes32 id) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 id) view returns (uint128 liquidity)",
]);

// PoolKey struct for v4
export interface V4PoolKey {
  currency0: string; // zero address for native ETH
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string; // zero address if no hooks
}

export interface V4PoolInfo {
  poolKey: V4PoolKey;
  poolId: string;
  sqrtPriceX96: bigint;
  currentTick: number;
  liquidity: bigint;
  lpFee: number;
  protocolFee: number;
}

// ─── Pool ID computation ──────────────────────────────────────────────────────
export function computeV4PoolId(poolKey: V4PoolKey): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
    ],
    [
      {
        currency0: poolKey.currency0 as `0x${string}`,
        currency1: poolKey.currency1 as `0x${string}`,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks as `0x${string}`,
      },
    ]
  );
  return keccak256(encoded);
}

// ─── Get pool info ────────────────────────────────────────────────────────────
export async function getV4Pool(poolKey: V4PoolKey): Promise<V4PoolInfo | null> {
  const publicClient = getPublicClient();

  try {
    const poolId = computeV4PoolId(poolKey);
    const [slot0, liquidity] = await Promise.all([
      publicClient.readContract({
        address: CONTRACTS.UNISWAP_V4_POOL_MANAGER,
        abi: V4_POOL_MANAGER_ABI,
        functionName: "getSlot0",
        args: [poolId],
      }),
      publicClient.readContract({
        address: CONTRACTS.UNISWAP_V4_POOL_MANAGER,
        abi: V4_POOL_MANAGER_ABI,
        functionName: "getLiquidity",
        args: [poolId],
      }),
    ]);

    const [sqrtPriceX96, currentTick, protocolFee, lpFee] = slot0;

    if (sqrtPriceX96 === 0n) return null; // Pool not initialized

    return {
      poolKey,
      poolId,
      sqrtPriceX96,
      currentTick: Number(currentTick),
      liquidity,
      lpFee: Number(lpFee),
      protocolFee: Number(protocolFee),
    };
  } catch {
    return null;
  }
}

// ─── V4 Actions encoding ──────────────────────────────────────────────────────
// V4 uses a multicall-style "unlock" mechanism with encoded actions
const Actions = {
  MINT_POSITION: 0x02,
  SETTLE_PAIR: 0x10,
  TAKE_PAIR: 0x11,
  DECREASE_LIQUIDITY: 0x04,
  COLLECT: 0x09,
  CLOSE_CURRENCY: 0x12,
} as const;

const V4_POSITION_MANAGER_ABI = parseAbi([
  "function modifyLiquidities(bytes unlockData, uint256 deadline) payable",
  "function nextTokenId() view returns (uint256)",
]);

// ─── Add liquidity v4 ─────────────────────────────────────────────────────────
export interface AddLiquidityV4Params {
  poolKey: V4PoolKey;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0Max: bigint;
  amount1Max: bigint;
  privateKey: `0x${string}`;
  recipientAddress: string;
}

export async function addLiquidityV4(params: AddLiquidityV4Params): Promise<{
  txHash: string;
  tokenId: string;
}> {
  const publicClient = getPublicClient();
  const { client: walletClient, account } = getWalletClient(params.privateKey);

  // Approve tokens if not native ETH
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  for (const [currency, amount] of [
    [params.poolKey.currency0, params.amount0Max],
    [params.poolKey.currency1, params.amount1Max],
  ] as [`0x${string}`, bigint][]) {
    if (currency === ZERO_ADDRESS) continue; // native ETH, no approval needed
    const allowance = await publicClient.readContract({
      address: currency,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [account.address, CONTRACTS.UNISWAP_V4_POSITION_MANAGER],
    });
    if (allowance < amount) {
      const approveTx = await walletClient.writeContract({
        address: currency,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.UNISWAP_V4_POSITION_MANAGER, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
    }
  }

  // Get next token ID before minting
  const nextTokenId = await publicClient.readContract({
    address: CONTRACTS.UNISWAP_V4_POSITION_MANAGER,
    abi: V4_POSITION_MANAGER_ABI,
    functionName: "nextTokenId",
  });

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  // Encode MINT_POSITION action
  const mintParams = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { type: "int24" },  // tickLower
      { type: "int24" },  // tickUpper
      { type: "uint256" }, // liquidity
      { type: "uint128" }, // amount0Max
      { type: "uint128" }, // amount1Max
      { type: "address" }, // recipient
      { type: "bytes" },   // hookData
    ],
    [
      {
        currency0: params.poolKey.currency0 as `0x${string}`,
        currency1: params.poolKey.currency1 as `0x${string}`,
        fee: params.poolKey.fee,
        tickSpacing: params.poolKey.tickSpacing,
        hooks: params.poolKey.hooks as `0x${string}`,
      },
      params.tickLower,
      params.tickUpper,
      params.liquidity,
      params.amount0Max,
      params.amount1Max,
      params.recipientAddress as `0x${string}`,
      "0x" as `0x${string}`,
    ]
  );

  const settleParams = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }],
    [
      params.poolKey.currency0 as `0x${string}`,
      params.poolKey.currency1 as `0x${string}`,
    ]
  );

  // Build unlock data: [actions_count, action, data_length, data, ...]
  const unlockData = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [
      ("0x" + Actions.MINT_POSITION.toString(16).padStart(2, "0") + Actions.SETTLE_PAIR.toString(16).padStart(2, "0")) as `0x${string}`,
      [mintParams, settleParams],
    ]
  );

  const isNativeETH =
    params.poolKey.currency0 === "0x0000000000000000000000000000000000000000";
  const value = isNativeETH ? params.amount0Max : 0n;

  const tx = await walletClient.writeContract({
    address: CONTRACTS.UNISWAP_V4_POSITION_MANAGER,
    abi: V4_POSITION_MANAGER_ABI,
    functionName: "modifyLiquidities",
    args: [unlockData, deadline],
    value,
  });

  await publicClient.waitForTransactionReceipt({ hash: tx });

  return {
    txHash: tx,
    tokenId: nextTokenId.toString(),
  };
}

export function getV4PoolKeyFromAddresses(
  tokenA: string,
  tokenB: string,
  fee: number,
  tickSpacing: number
): V4PoolKey {
  // Sort tokens: lower address = currency0
  const [currency0, currency1] =
    tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

  return {
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks: "0x0000000000000000000000000000000000000000",
  };
}
