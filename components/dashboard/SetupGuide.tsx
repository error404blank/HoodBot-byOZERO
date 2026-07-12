const STEPS = [
  {
    step: "01",
    title: "Buat bot via @BotFather",
    body: "Buka Telegram, cari @BotFather, kirim /newbot. Masukkan nama display (contoh: Hood Bot) lalu username yang diakhiri 'bot' (contoh: my_hoodbot). BotFather akan membalas dengan HTTP API Token.",
  },
  {
    step: "02",
    title: "Tambah env TELEGRAM_BOT_TOKEN",
    body: "Di v0, klik ikon Settings (atas kanan) → Vars → Add. Key: TELEGRAM_BOT_TOKEN, Value: token dari BotFather (format: 12345:AAxxxxxx). Lalu klik Save dan redeploy.",
  },
  {
    step: "03",
    title: "Tambah env TELEGRAM_BOT_USERNAME",
    body: "Tambah env var lagi: Key: TELEGRAM_BOT_USERNAME, Value: username bot tanpa @ (contoh: my_hoodbot). Ini dipakai untuk menampilkan link t.me di dashboard.",
  },
  {
    step: "04",
    title: "DATABASE_URL sudah otomatis (Neon)",
    body: "Neon sudah terkoneksi. DATABASE_URL tersedia otomatis. Tidak perlu setting manual.",
  },
  {
    step: "05",
    title: "Deploy ke Vercel lalu daftarkan Webhook",
    body: "Setelah deploy, klik tombol 'Daftarkan Webhook' di panel Koneksi Telegram di atas. Tombol itu otomatis mengirim setWebhook ke Telegram API dengan URL deployment kamu. Bot langsung aktif menerima pesan.",
  },
  {
    step: "06",
    title: "Kirim /start ke bot di Telegram",
    body: "Buka Telegram, cari username bot, kirim /start. Bot akan membalas dengan menu utama. Ikuti wizard untuk membuat atau import wallet. Semua private key dienkripsi AES-256-GCM dengan PIN 6 digit.",
  },
  {
    step: "07",
    title: "Lokal dev (opsional): pnpm run bot:dev",
    body: "Untuk development lokal, clone project, isi .env dengan TELEGRAM_BOT_TOKEN dan DATABASE_URL, lalu jalankan: pnpm run bot:dev. Mode ini memakai long polling — jangan jalankan bersamaan dengan webhook Vercel aktif.",
  },
] as const;

import { CollapsibleSection } from "./CollapsibleSection";

interface SetupGuideProps {
  completedSteps?: string[];
}

export function SetupGuide({ completedSteps = [] }: SetupGuideProps) {
  const badge = completedSteps.length > 0
    ? `${completedSteps.length}/${STEPS.length} selesai`
    : undefined;

  return (
    <CollapsibleSection title="Setup &amp; Integrasi Telegram" badge={badge}>
      <div className="divide-y divide-border/50">
        {STEPS.map(({ step, title, body }) => {
          const done = completedSteps.includes(step);
          return (
            <div key={step} className={`flex gap-4 px-4 py-4 transition-colors ${done ? "bg-primary/3" : ""}`}>
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${
                done ? "bg-primary/20 border-primary/40" : "bg-primary/10 border-primary/20"
              }`}>
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-label="Done">
                    <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary)" }} />
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
    </CollapsibleSection>
  );
}
