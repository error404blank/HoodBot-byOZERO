interface BotStatusBannerProps {
  botUsername?: string;
  tokenConnected?: boolean;
}

export function BotStatusBanner({ botUsername, tokenConnected = false }: BotStatusBannerProps) {
  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border px-4 py-3 ${
      tokenConnected
        ? "border-primary/30 bg-primary/8"
        : "border-yellow-500/30 bg-yellow-500/5"
    }`}>
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${tokenConnected ? "bg-primary" : "bg-yellow-500"}`} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tokenConnected ? "bg-primary" : "bg-yellow-500"}`} />
        </span>
        <span className="text-sm font-mono font-semibold text-foreground">HoodBot</span>
        <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
          tokenConnected
            ? "text-primary border-primary/30 bg-primary/10"
            : "text-yellow-500 border-yellow-500/30 bg-yellow-500/10"
        }`}>
          {tokenConnected ? "Token Connected" : "Token Missing"}
        </span>
        <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
          Robinhood Chain &mdash; ID 4663
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-foreground">
        <span>Uniswap V3 + V4</span>
        <span className="text-border">|</span>
        <span>Auto-Rebalance</span>
        <span className="text-border">|</span>
        <span>NFT Minting</span>
        {botUsername ? (
          <>
            <span className="text-border">|</span>
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-semibold"
            >
              @{botUsername}
            </a>
          </>
        ) : tokenConnected ? (
          <>
            <span className="text-border">|</span>
            <span className="text-muted-foreground/60 italic">Set TELEGRAM_BOT_USERNAME untuk link</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
