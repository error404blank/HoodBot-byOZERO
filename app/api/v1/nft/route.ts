import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";
import { db } from "@/src/db";
import { nftMints, wallets, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { decryptPrivateKeyAuto } from "@/src/services/wallet";
import {
  detectNftContract,
  autoDetectChain,
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
 * action: "simulate" — dry-run: estimate gas without sending (no PIN required)
 * action: "allowlist"— check if a wallet is on the allowlist
 * action: "mint"     — execute mint (session auth required, no PIN)
 *
 * Same-origin dashboard requests are allowed without API key.
 * External requests require X-API-Key header.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const isSameOrigin = origin ? origin.includes(host ?? "") : true;

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

  if (!SUPPORTED_MINT_CHAINS.find((c) => c.slug === chainSlug)) {
    return NextResponse.json(
      { error: `Unsupported chain: ${chainSlug}. Supported: ${SUPPORTED_MINT_CHAINS.map((c) => c.slug).join(", ")}` },
      { status: 400 }
    );
  }

  // ── autodetect — find which chain the contract is on ────────────────────────
  if (action === "autodetect") {
    try {
      const detectedChain = await autoDetectChain(contractAddress);
      if (!detectedChain) {
        return NextResponse.json({
          error: "Contract not found on any supported chain. Check the address and make sure you are on the right network.",
        }, { status: 404 });
      }
      const info = await detectNftContract(contractAddress, detectedChain);
      return NextResponse.json({
        ...info,
        mintPriceWei: info.mintPriceWei.toString(),
        detectedChain,
        mintFunctions: info.mintFunctions,
        abiSource: info.abiSource,
      });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── detect ──────────────────────────────────────────────────────────────────
  if (action === "detect") {
    try {
      const info = await detectNftContract(contractAddress, chainSlug);
      return NextResponse.json({ ...info, mintPriceWei: info.mintPriceWei.toString() });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // ── simulate (dry-run) ───────────────────────────────────────────────────────
  // Runs detect + simulateMint in parallel. No private key or PIN needed.
  if (action === "simulate") {
    const quantity = Number(body.quantity ?? 1);
    const walletAddress = body.walletAddress as string;
    if (!walletAddress) {
      return NextResponse.json({ error: "walletAddress required for simulate" }, { status: 400 });
    }
    try {
      // Detect first — get real mint price AND verified ABI mint functions
      const info = await detectNftContract(contractAddress, chainSlug);

      // Pass overrideFnSignature if caller requested a specific function
      const overrideFn = body.overrideFnSignature as string | undefined;

      const sim = await simulateMint(
        contractAddress,
        quantity,
        info.mintPriceWei,
        walletAddress,
        chainSlug,
        info.mintFunctions,   // pass ABI-derived functions — avoids refetching
        overrideFn,
      );

      return NextResponse.json({
        ...sim,
        contractName: info.name,
        mintPrice: info.mintPrice,
        phase: info.phase,
        standard: info.standard,
        abiSource: info.abiSource,
        mintFunctions: info.mintFunctions,  // return to frontend for override UI
      });
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
  // No PIN required — session auth only. Wallet decrypted server-side.
  if (action === "mint") {
    const walletId = Number(body.walletId);
    const quantity = Number(body.quantity ?? 1);
    const gasPreset = (body.gasPreset as "low" | "medium" | "high" | "custom") ?? "medium";
    const sniperMode = Boolean(body.sniperMode);
    const sniperTimeoutMs = Number(body.sniperTimeoutMs ?? 60_000);

    if (!walletId) {
      return NextResponse.json({ error: "walletId is required for mint" }, { status: 400 });
    }

    // Session auth required
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Not authenticated. Please log in to the dashboard first." }, { status: 401 });
    }

    const wallet = await db.query.wallets.findFirst({ where: eq(wallets.id, walletId) });
    if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

    if (wallet.userId !== sessionUser.id) {
      return NextResponse.json({ error: "Wallet does not belong to your account" }, { status: 403 });
    }

    // Fetch user for telegramId — used as fallback key for legacy bot-created wallets
    const user = await db.query.users.findFirst({ where: eq(users.id, wallet.userId) });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let privateKey: `0x${string}`;

    if (wallet.salt.startsWith("server:")) {
      // ── Web wallet (server-encrypted) — no PIN needed ──────────────────────
      try {
        const raw = await decryptPrivateKeyAuto(wallet.encryptedPrivateKey, wallet.encryptedIv, wallet.salt);
        privateKey = raw as `0x${string}`;
      } catch (e) {
        return NextResponse.json(
          { error: "Could not decrypt wallet. The server key may have changed — please re-import via Settings > Wallets." },
          { status: 403 }
        );
      }
    } else {
      // ── Legacy bot wallet — encrypted with user's 6-digit PIN ─────────────
      // We cannot decrypt this without the user's PIN. The user must re-import
      // this wallet from the dashboard which will re-encrypt it with WALLET_SECRET.
      return NextResponse.json(
        {
          error: "This wallet was created by the Telegram bot and is PIN-protected. To use it here, please re-import it: go to Settings → Wallets → Import Wallet, paste your private key or mnemonic, and it will be re-encrypted for dashboard use.",
          code: "LEGACY_PIN_WALLET",
        },
        { status: 403 }
      );
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
        detectedFn: body.detectedFn as string | undefined,
        gasPreset,
        maxFeePerGasGwei: body.maxFeePerGasGwei as number | undefined,
        maxPriorityFeePerGasGwei: body.maxPriorityFeePerGasGwei as number | undefined,
        sniperMode,
        sniperTimeoutMs,
      });

      const chain = SUPPORTED_MINT_CHAINS.find((c) => c.slug === chainSlug) ?? SUPPORTED_MINT_CHAINS[1];

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
        explorerUrl: `${chain.explorer}/tx/${result.txHash}`,
      });
    } catch (err) {
      console.error("[HoodBot API] mint error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
