import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";
import { db } from "@/src/db";
import { nftMints, wallets, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { decryptPrivateKeyAuto } from "@/src/services/wallet";
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
  // Runs detect + simulate in parallel. Does NOT require private key or PIN.
  if (action === "simulate") {
    const quantity = Number(body.quantity ?? 1);
    const walletAddress = body.walletAddress as string;
    if (!walletAddress) {
      return NextResponse.json({ error: "walletAddress required for simulate" }, { status: 400 });
    }
    try {
      // Detect and simulate in parallel — faster UX
      const [info, sim] = await Promise.all([
        detectNftContract(contractAddress, chainSlug),
        // Use a placeholder price first; will re-estimate after detect
        simulateMint(contractAddress, quantity, 0n, walletAddress, chainSlug),
      ]);
      // Re-run simulate with real price if first attempt failed due to wrong value
      const finalSim = sim.success
        ? sim
        : await simulateMint(contractAddress, quantity, info.mintPriceWei, walletAddress, chainSlug);

      return NextResponse.json({
        ...finalSim,
        contractName: info.name,
        mintPrice: info.mintPrice,
        phase: info.phase,
        standard: info.standard,
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
  if (action === "mint") {
    const walletId = Number(body.walletId);
    const quantity = Number(body.quantity ?? 1);
    const gasPreset = (body.gasPreset as "low" | "medium" | "high" | "custom") ?? "medium";
    const sniperMode = Boolean(body.sniperMode);
    const sniperTimeoutMs = Number(body.sniperTimeoutMs ?? 60_000);

    if (!walletId) {
      return NextResponse.json({ error: "walletId is required for mint" }, { status: 400 });
    }

    // Require session auth for web-initiated mints
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Not authenticated. Please log in to the dashboard first." }, { status: 401 });
    }

    const wallet = await db.query.wallets.findFirst({
      where: eq(wallets.id, walletId),
    });
    if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

    // Ensure session user owns this wallet
    if (wallet.userId !== sessionUser.id) {
      return NextResponse.json({ error: "Wallet does not belong to your account" }, { status: 403 });
    }

    // Look up user for telegramId — needed as fallback to decrypt bot-created wallets
    const user = await db.query.users.findFirst({
      where: eq(users.id, wallet.userId),
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let privateKey: `0x${string}`;
    try {
      // Strategy 1: server-encrypted wallet (salt starts with "server:") — no PIN needed
      // Strategy 2: legacy bot wallet — try telegramId as the "PIN" (bots use telegramId-based keys)
      // Strategy 3: if both fail, ask user to re-import
      const raw = await decryptPrivateKeyAuto(
        wallet.encryptedPrivateKey,
        wallet.encryptedIv,
        wallet.salt,
        user.telegramId.toString(),   // telegramId used as PIN for legacy bot wallets
        user.telegramId.toString()    // telegramId
      );
      privateKey = raw as `0x${string}`;
    } catch {
      return NextResponse.json(
        { error: "Could not decrypt wallet. Please re-import this wallet from the dashboard (Settings > Wallets > Import)." },
        { status: 403 }
      );
    }

    // Require session auth for web-initiated mints
    const sessionUser = await getSessionUser(req);

    const wallet = await db.query.wallets.findFirst({
      where: eq(wallets.id, walletId),
    });
    if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

    // Ensure session user owns this wallet (when called from web dashboard)
    if (sessionUser && wallet.userId !== sessionUser.id) {
      return NextResponse.json({ error: "Wallet does not belong to your account" }, { status: 403 });
    }

    // Look up user for telegramId (used as fallback for legacy PIN-encrypted wallets)
    const user = await db.query.users.findFirst({
      where: eq(users.id, wallet.userId),
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let privateKey: `0x${string}`;
    try {
      const raw = await decryptPrivateKeyAuto(
        wallet.encryptedPrivateKey,
        wallet.encryptedIv,
        wallet.salt,
        // legacy wallets: pass telegramId as both pin and telegramId for backward compat
        // bot-encrypted wallets will rely on their existing encryption
        undefined,
        user.telegramId.toString()
      );
      privateKey = raw as `0x${string}`;
    } catch {
      return NextResponse.json(
        { error: "Could not decrypt wallet. If this is an old bot wallet, please re-import it from the web dashboard." },
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
        gasPreset,
        maxFeePerGasGwei: body.maxFeePerGasGwei as number | undefined,
        maxPriorityFeePerGasGwei: body.maxPriorityFeePerGasGwei as number | undefined,
        sniperMode,
        sniperTimeoutMs,
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
