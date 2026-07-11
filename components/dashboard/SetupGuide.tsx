const STEPS = [
  {
    step: "01",
    title: "Buat bot via @BotFather",
    body: "Buka Telegram, cari @BotFather, kirim /newbot. Berikan nama (contoh: HoodBot) dan username (harus diakhiri 'bot', contoh: my_hoodbot). BotFather akan memberikan API Token berupa string seperti: 7412345678:AAHxxxxxxxxxxxxxxxx",
  },
  {
    step: "02",
    title: "Tambahkan TELEGRAM_BOT_TOKEN",
    body: 'Salin token dari BotFather. Di v0, klik Settings (atas kanan) → Vars → tambah variabel baru: Key = TELEGRAM_BOT_TOKEN, Value = token kamu. Tanpa env var ini bot tidak bisa jalan.',
  },
  {
    step: "03",
    title: "Tambahkan TELEGRAM_BOT_USERNAME (opsional)",
    body: "Tambahkan env var TELEGRAM_BOT_USERNAME berisi username bot tanpa @ (contoh: my_hoodbot). Ini memunculkan link t.me/... di dashboard supaya mudah diakses.",
  },
  {
    step: "04",
    title: "DATABASE_URL sudah otomatis",
    body: "Kalau Neon sudah terkoneksi (terlihat dari stats di atas yang muncul), DATABASE_URL sudah tersedia otomatis. Tidak perlu setting manual.",
  },
  {
    step: "05",
    title: "Opsional: RPC_URL custom",
    body: "Default RPC: https://rpc.mainnet.chain.robinhood.com. Untuk reliability lebih baik di produksi, tambah env var RPC_URL dengan endpoint RPC privat Robinhood Chain milikmu.",
  },
  {
    step: "06",
    title: "Install ts-node lalu jalankan bot",
    body: "Di terminal server kamu, jalankan: npm install -g ts-node typescript. Lalu masuk ke folder project dan jalankan: pnpm run bot:dev. Bot akan polling Telegram dan cron auto-rebalance akan aktif setiap 5 menit.",
  },
  {
    step: "07",
    title: "Buka bot di Telegram, kirim /start",
    body: "Cari username bot kamu di Telegram, kirim /start. Ikuti wizard untuk membuat atau import wallet. Semua private key dienkripsi AES-256-GCM dengan PIN 6 digit kamu — tidak ada yang disimpan plaintext.",
  },
] as const;

interface SetupGuideProps {
  completedSteps?: string[];
}

export function SetupGuide({ completedSteps = [] }: SetupGuideProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Setup &amp; Integrasi Telegram</h3>
        {completedSteps.length > 0 && (
          <span className="text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded px-2 py-0.5">
            {completedSteps.length}/{STEPS.length} selesai
          </span>
        )}
      </div>
      <div className="divide-y divide-border/50">
        {STEPS.map(({ step, title, body }) => {
          const done = completedSteps.includes(step);
          return (
            <div key={step} className={`flex gap-4 px-4 py-4 transition-colors ${done ? "bg-primary/3" : ""}`}>
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${
                done
                  ? "bg-primary/20 border-primary/40"
                  : "bg-primary/10 border-primary/20"
              }`}>
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Done">
                    <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary" style={{ color: "var(--primary)" }} />
                  </svg>
                ) : (
                  <span className="text-xs font-mono font-bold text-primary">{step}</span>
                )}
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono font-semibold ${done ? "text-primary" : "text-foreground"}`}>{title}</span>
                  {done && (
                    <span className="text-xs font-mono text-primary border border-primary/30 bg-primary/10 rounded px-1.5 py-0.5 leading-none">Done</span>
                  )}
                </div>
                <span className={`text-xs font-mono leading-relaxed ${done ? "text-muted-foreground/60 line-through decoration-primary/30" : "text-muted-foreground"}`}>{body}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
