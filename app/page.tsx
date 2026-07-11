import Image from "next/image";
import { StatCard } from "@/components/dashboard/StatCard";
import { PositionsTable } from "@/components/dashboard/PositionsTable";
import { NftMintsTable } from "@/components/dashboard/NftMintsTable";
import Link from "next/link";
import { BotStatusBanner } from "@/components/dashboard/BotStatusBanner";
import { WebhookPanel } from "@/components/dashboard/WebhookPanel";
import { VpsPanel } from "@/components/dashboard/VpsPanel";
import { EnvGenerator } from "@/components/dashboard/EnvGenerator";
import { CommandReference } from "@/components/dashboard/CommandReference";
import { SetupGuide } from "@/components/dashboard/SetupGuide";
import { db } from "@/src/db";
import { lpPositions, nftMints, wallets, users, autoMintWatchers } from "@/src/db/schema";
import { isNull, count, eq } from "drizzle-orm";

async function getDashboardData() {
  try {
    const [
      totalUsersResult,
      totalWalletsResult,
      openPositionsResult,
      totalMintsResult,
      activeWatchersResult,
      recentPositions,
      recentMints,
    ] = await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(wallets),
      db.select({ c: count() }).from(lpPositions).where(isNull(lpPositions.closedAt)),
      db.select({ c: count() }).from(nftMints),
      db.select({ c: count() }).from(autoMintWatchers).where(eq(autoMintWatchers.isActive, true)),
      db.query.lpPositions.findMany({
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: 20,
        where: isNull(lpPositions.closedAt),
      }),
      db.query.nftMints.findMany({
        orderBy: (t, { desc }) => [desc(t.mintedAt)],
        limit: 20,
      }),
    ]);

    return {
      stats: {
        totalUsers: Number(totalUsersResult[0]?.c ?? 0),
        totalWallets: Number(totalWalletsResult[0]?.c ?? 0),
        openPositions: Number(openPositionsResult[0]?.c ?? 0),
        totalMints: Number(totalMintsResult[0]?.c ?? 0),
        activeWatchers: Number(activeWatchersResult[0]?.c ?? 0),
      },
      positions: recentPositions,
      mints: recentMints,
    };
  } catch {
    return null;
  }
}

export default async function Page() {
  const data = await getDashboardData();
  const stats = data?.stats;
  const positions = data?.positions ?? [];
  const mints = data?.mints ?? [];

  const tokenConnected = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  const dbConnected = Boolean(process.env.DATABASE_URL);
  const deploymentUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.V0_RUNTIME_URL ?? undefined;
  const hasApiKey = Boolean(process.env.HOODBOT_API_KEY);

  // Mark setup steps as done based on env state
  const completedSteps: string[] = [];
  if (tokenConnected) completedSteps.push("01", "02");
  if (botUsername) completedSteps.push("03");
  if (dbConnected) completedSteps.push("04");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="HoodBot" width={32} height={32} className="rounded-lg" />
            <div className="flex flex-col">
              <span className="font-mono font-bold text-sm text-foreground leading-tight">HoodBot</span>
              <span className="font-mono text-xs text-muted-foreground leading-tight">DeFi LP &amp; NFT Telegram Bot</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/agent"
              className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-primary hover:text-primary/80 transition-colors border border-primary/30 bg-primary/5 rounded-md px-2.5 py-1.5"
            >
              AI Agent API
            </Link>
            <a
              href="https://robinhoodchain.blockscout.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md px-2.5 py-1.5"
            >
              Explorer
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M1 9L9 1M9 1H4M9 1V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
            <span className="text-xs font-mono bg-primary/10 border border-primary/20 text-primary rounded-md px-2.5 py-1.5">
              Chain 4663
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 flex flex-col gap-6">
        {/* Status banner */}
        <BotStatusBanner botUsername={botUsername} tokenConnected={tokenConnected} />

        {/* Telegram connection panel */}
        <WebhookPanel botUsername={botUsername} tokenConnected={tokenConnected} />

        {/* Stats grid */}
        <section aria-label="Bot statistics">
          <h2 className="sr-only">Statistics</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label="Users"
              value={stats ? String(stats.totalUsers) : "—"}
              subValue="Telegram accounts"
              highlight={false}
            />
            <StatCard
              label="Wallets"
              value={stats ? String(stats.totalWallets) : "—"}
              subValue="Encrypted on-chain"
            />
            <StatCard
              label="Open Positions"
              value={stats ? String(stats.openPositions) : "—"}
              subValue="V3 + V4 LP"
              highlight
            />
            <StatCard
              label="NFT Mints"
              value={stats ? String(stats.totalMints) : "—"}
              subValue="All time"
            />
            <StatCard
              label="Auto-Watchers"
              value={stats ? String(stats.activeWatchers) : "—"}
              subValue="Active mint watchers"
            />
          </div>
        </section>

        {/* LP Positions */}
        <section aria-label="LP Positions">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Open LP Positions
            </h2>
            <span className="text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded px-2 py-0.5">
              {positions.length} active
            </span>
          </div>
          <PositionsTable positions={positions} />
        </section>

        {/* NFT Mints */}
        <section aria-label="NFT Mints">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Recent NFT Mints
            </h2>
            <span className="text-xs font-mono text-muted-foreground border border-border rounded px-2 py-0.5">
              Last 20
            </span>
          </div>
          <NftMintsTable mints={mints} />
        </section>

        {/* Two-col: Commands + Setup */}
        <section aria-label="Commands and setup">
          <div className="flex items-center mb-3">
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Reference &amp; Setup
            </h2>
          </div>
          <CommandReference />
        </section>

        <section aria-label="Setup guide">
          <SetupGuide completedSteps={completedSteps} />
        </section>

        {/* VPS setup */}
        <section aria-label="VPS setup">
          <VpsPanel />
        </section>

        {/* .env generator */}
        <section aria-label="Environment variables">
          <EnvGenerator
            deploymentUrl={deploymentUrl}
            hasBotToken={tokenConnected}
            hasBotUsername={Boolean(botUsername)}
            hasDatabase={dbConnected}
          />
        </section>

        {/* AI Agent CTA */}
        <section aria-label="AI Agent integration">
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-mono font-semibold text-foreground">Integrasi AI Agent (Hermes / LangChain)</span>
              <span className="text-xs font-mono text-muted-foreground">
                Gunakan REST API HoodBot untuk memberi kemampuan DeFi ke AI Agent kamu — baca market data, trigger LP, dan mint NFT secara otomatis.
              </span>
            </div>
            <Link
              href="/agent"
              className="shrink-0 text-xs font-mono px-4 py-2 rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-center"
            >
              Lihat Dokumentasi API
            </Link>
          </div>
        </section>

        {/* Contract addresses */}
        <section aria-label="Contract addresses">
          <div className="rounded-lg border border-border bg-card">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Contract Addresses — Robinhood Chain</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/50">
              {[
                { label: "WETH", addr: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" },
                { label: "USDG", addr: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" },
                { label: "Uniswap V3 Factory", addr: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA" },
                { label: "V3 NonfungiblePositionManager", addr: "0x3d79EdAaBC0EaB6F08ED885C05Fc0B014290D95A" },
                { label: "Uniswap V4 PoolManager", addr: "0x8366a39CC670B4001A1121B8F6A443A643e40951" },
                { label: "V4 PositionManager", addr: "0x1B1C77B606d13b09C84d1c7394B96b147bC03147" },
              ].map(({ label, addr }) => (
                <div key={label} className="flex flex-col gap-1 px-4 py-3">
                  <span className="text-xs font-mono text-muted-foreground">{label}</span>
                  <a
                    href={`https://robinhoodchain.blockscout.com/address/${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-primary hover:underline break-all"
                  >
                    {addr}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center py-4 border-t border-border">
          <p className="text-xs font-mono text-muted-foreground">
            HoodBot &mdash; Uniswap V3/V4 LP &amp; NFT Minting on Robinhood Chain (4663)
          </p>
          <p className="text-xs font-mono text-muted-foreground/50 mt-1">
            Data via GeckoTerminal &middot; GMGN.ai &middot; Basedbot &middot; Blockscout
          </p>
        </footer>
      </main>
    </div>
  );
}
