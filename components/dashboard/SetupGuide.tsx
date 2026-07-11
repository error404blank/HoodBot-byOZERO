const STEPS = [
  {
    step: "01",
    title: "Set TELEGRAM_BOT_TOKEN",
    body: "Create a bot via @BotFather on Telegram. Copy the token and add it as an environment variable: TELEGRAM_BOT_TOKEN",
  },
  {
    step: "02",
    title: "Set DATABASE_URL",
    body: "Connect the Neon integration (already done if you see stats above). The DATABASE_URL env var is provisioned automatically.",
  },
  {
    step: "03",
    title: "Optional: RPC_URL",
    body: "By default the bot uses https://rpc.mainnet.chain.robinhood.com. Set RPC_URL to a private endpoint for better reliability.",
  },
  {
    step: "04",
    title: "Run the bot",
    body: "Install ts-node globally or use pnpm exec ts-node. Then run: pnpm run bot:dev. The bot polls Telegram and starts the cron scheduler.",
  },
  {
    step: "05",
    title: "Use /start in Telegram",
    body: "Open your bot in Telegram and send /start to create or import your first wallet. All keys are AES-256-GCM encrypted with your PIN.",
  },
] as const;

export function SetupGuide() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Setup Guide</h3>
      </div>
      <div className="divide-y divide-border/50">
        {STEPS.map(({ step, title, body }) => (
          <div key={step} className="flex gap-4 px-4 py-4">
            <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="text-xs font-mono font-bold text-primary">{step}</span>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-sm font-mono font-semibold text-foreground">{title}</span>
              <span className="text-xs font-mono text-muted-foreground leading-relaxed">{body}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
