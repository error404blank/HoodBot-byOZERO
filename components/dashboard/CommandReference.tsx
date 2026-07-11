const COMMANDS = [
  { cmd: "/start", desc: "Main menu with all features" },
  { cmd: "/wallet", desc: "Create, import & manage wallets" },
  { cmd: "/lp", desc: "Add V3/V4 liquidity, view positions" },
  { cmd: "/positions", desc: "View all open LP positions" },
  { cmd: "/fees", desc: "Collect uncollected LP fees" },
  { cmd: "/nft", desc: "Mint NFTs from any existing contract" },
  { cmd: "/market", desc: "Top pools, token prices & safety" },
  { cmd: "/settings", desc: "Slippage, gas & auto-rebalance" },
  { cmd: "/help", desc: "Full command reference" },
] as const;

const FEATURES = [
  { label: "Wallet", items: ["Generate new wallet", "Import private key / seed phrase", "AES-256-GCM encryption with scrypt KDF", "Per-user 6-digit PIN protection"] },
  { label: "LP (V3)", items: ["Pool discovery via GeckoTerminal", "Add liquidity with range selection", "Remove liquidity (partial or full)", "Collect fees", "Auto-rebalance via 5-min cron"] },
  { label: "LP (V4)", items: ["Uniswap V4 PoolManager support", "PoolKey-based position minting", "Full-range & custom tick ranges", "Token approval & deadline handling"] },
  { label: "NFT Mint", items: ["Detect ERC-721 / ERC-1155 contracts", "Auto-detect mint price & supply", "Try all common mint signatures", "Auto-mint watcher (cron-based)"] },
  { label: "Data", items: ["GeckoTerminal — top pools, TVL, vol", "GMGN.ai — token safety & honeypot", "Basedbot — trending signals", "Blockscout explorer links"] },
] as const;

export function CommandReference() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Commands */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Bot Commands</h3>
        </div>
        <div className="divide-y divide-border/50">
          {COMMANDS.map(({ cmd, desc }) => (
            <div key={cmd} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
              <code className="text-xs text-primary font-mono shrink-0 pt-0.5">{cmd}</code>
              <span className="text-xs text-muted-foreground font-mono">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature breakdown */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Feature Overview</h3>
        </div>
        <div className="divide-y divide-border/50">
          {FEATURES.map(({ label, items }) => (
            <div key={label} className="px-4 py-3">
              <div className="text-xs font-mono font-semibold text-foreground mb-1.5">{label}</div>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                    <span className="h-1 w-1 rounded-full bg-primary/60 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
