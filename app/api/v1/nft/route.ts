import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";
import { db } from "@/src/db";
import { nftMints, wallets, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { decryptPrivateKey } from "@/src/services/wallet";
import { detectNftContract, mintNft } from "@/src/services/nft";


export const dynamic = "force-dynamic";

/**
 * POST /api/v1/nft
 * Detect NFT contract info or trigger a mint.
 *
 * Body (detect):
 * {
 *   "action": "detect",
 *   "contractAddress": "0x..."
 * }
 *
 * Body (mint):
 * {
 *   "action": "mint",
 *   "telegramId": "123456789",
 *   "walletId": 1,
 *   "pin": "123456",
 *   "contractAddress": "0x...",
 *   "quantity": 1
 * }
 *
 * AI Agent usage:
 *   curl -X POST -H "X-API-Key: $HOODBOT_API_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"action":"detect","contractAddress":"0x..."}' \
 *     "https://<domain>/api/v1/nft"
 */
export async function POST(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action as string;
  const contractAddress = body.contractAddress as string;

  if (!contractAddress) {
    return NextResponse.json({ error: "contractAddress required" }, { status: 400 });
  }

  // ── detect ─────────────────────────────────────────────────────────────────
  if (action === "detect") {
    try {
      const info = await detectNftContract(contractAddress);
      return NextResponse.json({ contractAddress, ...info });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── mint ───────────────────────────────────────────────────────────────────
  if (action === "mint") {
    const telegramId = body.telegramId as string;
    const walletId = body.walletId as number;
    const pin = body.pin as string;
    const quantity = (body.quantity as number) ?? 1;

    if (!telegramId || !walletId || !pin) {
      return NextResponse.json(
        { error: "telegramId, walletId, pin required for mint" },
        { status: 400 }
      );
    }

    const user = await db.query.users.findFirst({
      where: eq(users.telegramId, BigInt(telegramId)),
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const wallet = await db.query.wallets.findFirst({
      where: (t, { and }) => and(eq(t.id, walletId), eq(t.userId, user.id)),
    });
    if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

    let privateKey: `0x${string}`;
    try {
      const raw = await decryptPrivateKey(
        wallet.encryptedPrivateKey,
        wallet.encryptedIv,
        wallet.salt,
        pin,
        telegramId
      );
      privateKey = raw as `0x${string}`;
    } catch {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
    }

    try {
      // Detect price first so mintNft knows the value to send
      const info = await detectNftContract(contractAddress);
      const result = await mintNft({
        privateKey,
        contractAddress,
        quantity,
        mintPrice: info.mintPrice,
        recipientAddress: wallet.address,
      });

      // Record in DB
      await db.insert(nftMints).values({
        userId: user.id,
        walletId: wallet.id,
        contractAddress,
        tokenId: null,
        quantity,
        txHash: result.txHash,
      });

      return NextResponse.json({
        success: true,
        txHash: result.txHash,
        contractAddress,
        explorerUrl: `https://robinhoodchain.blockscout.com/tx/${result.txHash}`,
      });
    } catch (err) {
      console.error("[HoodBot API] mint error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
