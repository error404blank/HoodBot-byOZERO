import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { parseEther, parseGwei, isAddress } from "viem";
import { db } from "@/src/db";
import { wallets, users } from "@/src/db/schema";
import { getSessionUser } from "@/lib/session";
import { decryptPrivateKey } from "@/src/services/wallet";
import { getPublicClientForChain, getWalletClientForChain, type MintChainSlug } from "@/src/services/chain";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    walletId: number;
    chain: string;
    toAddress: string;
    amount: string;
    pin?: string;
    dryRun?: boolean;
    gasPreset?: "low" | "medium" | "high" | "custom";
    maxFeePerGasGwei?: number;
    maxPriorityFeePerGasGwei?: number;
  };

  const { walletId, toAddress, amount, pin, dryRun = true, gasPreset = "medium" } = body;
  const chain = (body.chain ?? "robinhood") as MintChainSlug;

  if (!walletId || !toAddress || !amount) {
    return NextResponse.json({ error: "walletId, toAddress, amount required" }, { status: 400 });
  }

  if (!isAddress(toAddress)) {
    return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 });
  }

  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.id, walletId),
  });
  if (!wallet || wallet.userId !== user.id) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const owner = await db.query.users.findFirst({ where: eq(users.id, wallet.userId) });
  if (!owner) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let valueWei: bigint;
  try {
    valueWei = parseEther(amount);
  } catch {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const publicClient = getPublicClientForChain(chain);

  // Dry run — estimate gas + compute fee breakdown
  if (dryRun) {
    try {
      const gas = await publicClient.estimateGas({
        account: wallet.address as `0x${string}`,
        to: toAddress as `0x${string}`,
        value: valueWei,
      });
      // Apply safe buffer (+20%) for L2/Orbit chains where gas underestimate is common
      const gasWithBuffer = BigInt(Math.ceil(Number(gas) * 1.2));
      let feeInfo: { maxFeePerGas?: string; maxPriorityFeePerGas?: string } = {};
      try {
        const fees = await publicClient.estimateFeesPerGas();
        feeInfo = {
          maxFeePerGas: fees.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas?.toString(),
        };
      } catch { /* legacy chain — no EIP-1559 */ }
      return NextResponse.json({ gasEstimate: gas.toString(), gasWithBuffer: gasWithBuffer.toString(), ...feeInfo });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Simulation failed: ${msg.slice(0, 120)}` });
    }
  }

  // Live send — need PIN
  if (!pin) {
    return NextResponse.json({ error: "PIN required for live send" }, { status: 400 });
  }

  let privateKey: `0x${string}`;
  try {
    const raw = await decryptPrivateKey(
      wallet.encryptedPrivateKey,
      wallet.encryptedIv,
      wallet.salt,
      pin,
      owner.telegramId.toString()
    );
    privateKey = raw as `0x${string}`;
  } catch {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
  }

  const { client, account } = getWalletClientForChain(privateKey, chain);

  try {
    // Build gas overrides — apply multiplier or use custom gwei values
    let gasOverrides: Record<string, bigint> = {};
    if (gasPreset === "custom" && body.maxFeePerGasGwei && body.maxPriorityFeePerGasGwei) {
      gasOverrides = {
        maxFeePerGas: parseGwei(String(body.maxFeePerGasGwei)),
        maxPriorityFeePerGas: parseGwei(String(body.maxPriorityFeePerGasGwei)),
      };
    } else if (gasPreset !== "low") {
      const multiplier = gasPreset === "high" ? 1.5 : 1.2;
      try {
        const fees = await publicClient.estimateFeesPerGas();
        if (fees.maxFeePerGas) {
          gasOverrides = {
            maxFeePerGas: BigInt(Math.ceil(Number(fees.maxFeePerGas) * multiplier)),
            maxPriorityFeePerGas: BigInt(Math.ceil(Number(fees.maxPriorityFeePerGas ?? parseGwei("1")) * multiplier)),
          };
        }
      } catch { /* legacy chain */ }
    }

    const txHash = await client.sendTransaction({
      account,
      to: toAddress as `0x${string}`,
      value: valueWei,
      chain: undefined,
      ...gasOverrides,
    });
    return NextResponse.json({ txHash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 200) });
  }
}
