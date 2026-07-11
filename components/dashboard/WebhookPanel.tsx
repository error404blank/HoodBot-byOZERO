"use client";

import { useState } from "react";

interface WebhookPanelProps {
  botUsername?: string;
  tokenConnected: boolean;
}

export function WebhookPanel({ botUsername, tokenConnected }: WebhookPanelProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function registerWebhook() {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/telegram/register-webhook", { method: "POST" });
      const json = await res.json() as { ok?: boolean; description?: string; error?: string };
      if (res.ok && json.ok) {
        setStatus("ok");
        setMessage("Webhook berhasil didaftarkan!");
      } else {
        setStatus("error");
        setMessage(json.description ?? json.error ?? "Gagal mendaftarkan webhook.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Coba lagi.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Koneksi Telegram</h3>
        {tokenConnected && (
          <span className="text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded px-2 py-0.5">Token aktif</span>
        )}
      </div>
      <div className="p-4 flex flex-col gap-4">
        {/* Mode explanation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-secondary/50 p-3 flex flex-col gap-1">
            <span className="text-xs font-mono font-semibold text-foreground">Mode Lokal (Long Polling)</span>
            <span className="text-xs font-mono text-muted-foreground leading-relaxed">
              Jalankan <code className="bg-primary/10 text-primary px-1 rounded">pnpm run bot:dev</code> di terminal server/VPS. Bot terus polling Telegram. Cocok untuk development.
            </span>
          </div>
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 flex flex-col gap-1">
            <span className="text-xs font-mono font-semibold text-primary">Mode Vercel (Webhook) — Recommended</span>
            <span className="text-xs font-mono text-muted-foreground leading-relaxed">
              Deploy ke Vercel, lalu klik tombol di bawah untuk mendaftarkan webhook. Telegram akan push update langsung ke server.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={registerWebhook}
            disabled={!tokenConnected || status === "loading"}
            className="flex items-center gap-2 text-xs font-mono font-semibold bg-primary text-primary-foreground rounded-md px-3 py-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {status === "loading" ? (
              <span className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M1 6C1 3.24 3.24 1 6 1s5 2.24 5 5-2.24 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M6 8.5L6 6M6 6L4.5 7.5M6 6L7.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {status === "loading" ? "Mendaftarkan..." : "Daftarkan Webhook"}
          </button>

          {botUsername && (
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs font-mono font-semibold border border-primary/30 text-primary rounded-md px-3 py-2 hover:bg-primary/10 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M10.5 1.5L1.5 4.5L5 6L7 10.5L10.5 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M5 6L7.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Buka @{botUsername}
            </a>
          )}

          {!tokenConnected && (
            <span className="text-xs font-mono text-yellow-500">
              Tambahkan TELEGRAM_BOT_TOKEN di Settings &rarr; Vars terlebih dahulu.
            </span>
          )}
        </div>

        {/* Feedback */}
        {message && (
          <div className={`text-xs font-mono px-3 py-2 rounded-md border ${
            status === "ok"
              ? "text-primary border-primary/30 bg-primary/10"
              : "text-destructive border-destructive/30 bg-destructive/10"
          }`}>
            {message}
          </div>
        )}

        {/* Webhook URL display */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-mono text-muted-foreground">Webhook URL (setelah deploy Vercel):</span>
          <code className="text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1.5 text-muted-foreground break-all">
            https://&lt;your-domain&gt;/api/telegram/webhook
          </code>
        </div>
      </div>
    </div>
  );
}
