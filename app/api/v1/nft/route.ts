import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";
import { db } from "@/src/db";
import { nftMints, wallets, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { decryptPrivateKey } from "@/src/services/wallet";
import {
  detectNftContract,
  mintNft,
  simulateMint,
  checkAllowlist,
} from "@/src/services/nft";
import { type MintChainSlug, SUPPORTED_MINT_CHAINS } from "@/src/services/chain";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/nft
 *
 * action: "detect"   — fetch contract info (phase, supply, price)
 * action: "simulate" — dry-run: estimate gas without sending
 * action: "allowlist"— check if a wallet is on the allowlist
 * action: "mint"     — execute mint (requires telegramId, walletId, pin)
 *
 * All actions require X-API-Key header.
 */
export async function POST(req: NextRequest) {
  // Allow same-origin dashboard requests OR external requests with valid API key
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const isSameOrigin = origin ? origin.includes(host ?? "") : true; // server-side fetch has no origin

  if (!isSameOrigin) {
    const auth = requireApiKey(req);
    if (auth) return auth;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action as string;
  const contractAddress = body.contractAddress as string;
  const chainSlug = (body.chainSlug as MintChainSlug) ?? "robinhood";

  if (!contractAddress) {
    return NextResponse.json({ error: "contractAddress required" }, { status: 400 });
  }

  // Validate chainSlug
  if (!SUPPORTED_MINT_CHAINS.find((c) => c.slug === chainSlug)) {
    return NextResponse.json(
      { error: `Unsupported chain: ${chainSlug}. Supported: ${SUPPORTED_MINT_CHAINS.map((c) => c.slug).join(", ")}` },
      { status: 400 }
    );
  }

  // ── detect ──────────────────────────────────────────────────────────────────
  if (action === "detect") {
    try {
      const info = await detectNftContract(contractAddress, chainSlug);
      return NextResponse.json({
        ...info,
        mintPriceWei: info.mintPriceWei.toString(),
      });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── simulate (dry-run) ───────────────────────────────────────────────────────
  if (action === "simulate") {
    const quantity = Number(body.quantity ?? 1);
    const walletAddress = body.walletAddress as string;
    if (!walletAddress) {
      return NextResponse.json({ error: "walletAddress required for simulate" }, { status: 400 });
    }
    try {
      const info = await detectNftContract(contractAddress, chainSlug);
      const sim = await simulateMint(contractAddress, quantity, info.mintPriceWei, walletAddress, chainSlug);
      return NextResponse.json(sim);
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── allowlist check ──────────────────────────────────────────────────────────
  if (action === "allowlist") {
    const walletAddress = body.walletAddress as string;
    if (!walletAddress) {
      return NextResponse.json({ error: "walletAddress required for allowlist" }, { status: 400 });
    }
    try {
      const eligible = await checkAllowlist(contractAddress, walletAddress);
      return NextResponse.json({
        contractAddress,
        walletAddress,
        eligible,
        note: eligible === null ? "Contract has no allowlist function" : undefined,
      });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── mint ─────────────────────────────────────────────────────────────────────
  if (action === "mint") {
    const walletId = Number(body.walletId);
    const pin = body.pin as string;
    const quantity = Number(body.quantity ?? 1);

    if (!walletId || !pin) {
      return NextResponse.json(
        { error: "walletId and pin are required for mint" },
        { status: 400 }
      );
    }

    // Look up wallet directly by ID — no telegramId needed from web dashboard
    const wallet = await db.query.wallets.findFirst({
      where: eq(wallets.id, walletId),
    });
    if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

    // Look up user to get telegramId for decryption
    const user = await db.query.users.findFirst({
      where: eq(users.id, wallet.userId),
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const telegramId = user.telegramId.toString();

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
      const info = await detectNftContract(contractAddress, chainSlug);
      const result = await mintNft({
        privateKey,
        contractAddress,
        quantity,
        mintPriceWei: info.mintPriceWei,
        recipientAddress: wallet.address,
        chainSlug,
      });

      // Get chain explorer URL
      const chain = SUPPORTED_MINT_CHAINS.find((c) => c.slug === chainSlug) ?? SUPPORTED_MINT_CHAINS[1];
      const explorerUrl = `${chain.explorer}/tx/${result.txHash}`;

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
        gasUsed: result.gasUsed,
        contractAddress,
        chain: chain.name,
        explorerUrl,
      });
    } catch (err) {
      console.error("[HoodBot API] mint error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
