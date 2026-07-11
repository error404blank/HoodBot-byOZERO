import { db } from "../db";
import { lpPositions, wallets, users } from "../db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getV3Pool, removeLiquidityV3, addLiquidityV3, nearestUsableTick, priceToTick, FEE_TIERS, type FeeTier } from "./uniswapV3";
import { decryptPrivateKey } from "./wallet";

export interface RebalanceResult {
  positionId: number;
  success: boolean;
  txHash?: string;
  reason?: string;
  newTickLower?: number;
  newTickUpper?: number;
}

/**
 * Check if a position is out of range and needs rebalancing.
 * Returns the current price deviation from center.
 */
export function isOutOfRange(
  currentTick: number,
  tickLower: number,
  tickUpper: number
): boolean {
  return currentTick < tickLower || currentTick > tickUpper;
}

export function priceDeviationPercent(
  currentTick: number,
  tickLower: number,
  tickUpper: number
): number {
  const center = (tickLower + tickUpper) / 2;
  const halfRange = (tickUpper - tickLower) / 2;
  if (halfRange === 0) return 100;
  const deviation = Math.abs(currentTick - center) / halfRange;
  return deviation * 100;
}

/**
 * Run auto-rebalance check for all active positions.
 * Called by cron job every 5 minutes.
 */
export async function runAutoRebalanceCheck(
  sendTelegramNotification: (userId: number, message: string) => Promise<void>,
  pinResolver: (userId: number, walletId: number) => Promise<string | null>
): Promise<RebalanceResult[]> {
  const results: RebalanceResult[] = [];

  // Fetch all positions with auto_rebalance enabled and not closed
  const positions = await db
    .select({
      position: lpPositions,
      wallet: wallets,
      user: users,
    })
    .from(lpPositions)
    .innerJoin(wallets, eq(lpPositions.walletId, wallets.id))
    .innerJoin(users, eq(lpPositions.userId, users.id))
    .where(
      and(
        eq(lpPositions.autoRebalance, true),
        isNull(lpPositions.closedAt),
        eq(lpPositions.version, "v3") // v4 rebalance in next phase
      )
    );

  for (const { position, wallet, user } of positions) {
    if (!position.token0 || !position.token1 || !position.tickLower || !position.tickUpper) {
      continue;
    }

    try {
      const pool = await getV3Pool(
        position.token0,
        position.token1,
        position.feeTier as FeeTier
      );

      if (!pool) continue;

      const deviation = priceDeviationPercent(
        pool.currentTick,
        position.tickLower,
        position.tickUpper
      );
      const threshold = parseFloat(String(position.rebalanceThreshold ?? 15));

      if (deviation < threshold && !isOutOfRange(pool.currentTick, position.tickLower, position.tickUpper)) {
        continue; // Position still in range
      }

      // Need to rebalance — resolve PIN
      const pin = await pinResolver(Number(user.telegramId), wallet.id);
      if (!pin) {
        await sendTelegramNotification(
          Number(user.telegramId),
          `Auto-rebalance for position #${position.id} needs your PIN. Please re-authorize via /settings.`
        );
        results.push({ positionId: position.id, success: false, reason: "PIN not available" });
        continue;
      }

      // Decrypt private key
      const privateKey = await decryptPrivateKey(
        wallet.encryptedPrivateKey,
        wallet.encryptedIv,
        wallet.salt,
        pin,
        String(user.telegramId)
      );

      // Remove existing liquidity
      const removeResult = await removeLiquidityV3({
        tokenId: position.tokenId!,
        percentToRemove: 100,
        privateKey: privateKey as `0x${string}`,
        recipientAddress: wallet.address,
      });

      // Re-add centered on current price with same range width
      const rangeWidth = (position.tickUpper - position.tickLower) / 2;
      const newTickLower = nearestUsableTick(
        Math.floor(pool.currentTick - rangeWidth),
        pool.tickSpacing
      );
      const newTickUpper = nearestUsableTick(
        Math.ceil(pool.currentTick + rangeWidth),
        pool.tickSpacing
      );

      // Notify user of rebalance
      await sendTelegramNotification(
        Number(user.telegramId),
        [
          `Auto-Rebalance triggered for position #${position.id}`,
          `Pool: ${position.token0.slice(0, 8)}.../${position.token1.slice(0, 8)}...`,
          `Price moved ${deviation.toFixed(1)}% from center`,
          `Old range: [${position.tickLower}, ${position.tickUpper}]`,
          `New range: [${newTickLower}, ${newTickUpper}]`,
          `Remove TX: ${removeResult.txHash}`,
        ].join("\n")
      );

      // Update position in DB
      await db
        .update(lpPositions)
        .set({
          tickLower: newTickLower,
          tickUpper: newTickUpper,
          closedAt: null,
        })
        .where(eq(lpPositions.id, position.id));

      results.push({
        positionId: position.id,
        success: true,
        txHash: removeResult.txHash,
        newTickLower,
        newTickUpper,
      });
    } catch (err) {
      results.push({
        positionId: position.id,
        success: false,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}
