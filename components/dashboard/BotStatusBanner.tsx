interface BotStatusBannerProps {
  botUsername?: string;
}

export function BotStatusBanner({ botUsername }: BotStatusBannerProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        <span className="text-sm font-mono font-semibold text-foreground">
          RobinhoodBot
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          Robinhood Chain &mdash; ID 4663
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
        <span>Uniswap V3 + V4</span>
        <span className="text-border">|</span>
        <span>Auto-Rebalance</span>
        <span className="text-border">|</span>
        <span>NFT Minting</span>
        {botUsername && (
          <>
            <span className="text-border">|</span>
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              @{botUsername}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
