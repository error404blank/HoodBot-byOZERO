"use client";

import { useState } from "react";

interface EnvGeneratorProps {
  deploymentUrl?: string;
  hasBotToken?: boolean;
  hasBotUsername?: boolean;
  hasDatabase?: boolean;
}

export function EnvGenerator({
  deploymentUrl,
  hasBotToken,
  hasBotUsername,
  hasDatabase,
}: EnvGeneratorProps) {
  const [copied, setCopied] = useState(false);

  const lines = [
    "# ── HoodBot Environment Variables ──────────────────────────────────────",
    `TELEGRAM_BOT_TOKEN=${hasBotToken ? "<sudah ada di Vercel>" : "<isi token dari @BotFather>"}`,
    `TELEGRAM_BOT_USERNAME=${hasBotUsername ? "<sudah ada di Vercel>" : "<username bot tanpa @>"}`,
    `TELEGRAM_WEBHOOK_SECRET=<string_random_untuk_keamanan>`,
    "",
    "# ── Database (Neon PostgreSQL) ────────────────────────────────────────",
    `DATABASE_URL=${hasDatabase ? "<sudah ada di Vercel — salin dari Settings Vars>" : "<connection string dari Neon dashboard>"}`,
    "",
    "# ── Blockchain ───────────────────────────────────────────────────────",
    "# Default RPC sudah terisi otomatis. Isi ini hanya jika punya endpoint privat:",
    "# RPC_URL=https://rpc.mainnet.chain.robinhood.com",
    "",
    "# ── API Key untuk AI Agent ───────────────────────────────────────────",
    "HOODBOT_API_KEY=<buat_string_random_panjang_min_32_karakter>",
    "",
    "# ── Deployment URL (untuk webhook) ───────────────────────────────────",
    `VERCEL_URL=${deploymentUrl ?? "<domain.vercel.app>"}`,
  ].join("\n");

  const copy = () => {
    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          .env File Generator
        </h3>
        <button
          onClick={copy}
          className="text-xs font-mono px-3 py-1 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          {copied ? "Copied!" : "Copy .env"}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-muted-foreground leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
        {lines}
      </pre>
      <div className="px-4 pb-4">
        <p className="text-xs font-mono text-muted-foreground/60">
          Salin konten di atas ke file <code className="text-primary">.env</code> di root folder project di VPS kamu, lalu ganti semua nilai dalam tanda <code className="text-primary">&lt; &gt;</code>.
        </p>
      </div>
    </div>
  );
}
