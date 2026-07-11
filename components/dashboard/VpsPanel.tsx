"use client";

import { useState } from "react";

const COMMANDS = {
  check: [
    { label: "Cek OS", cmd: "cat /etc/os-release | head -5" },
    { label: "Cek Node.js", cmd: "node --version" },
    { label: "Cek npm/pnpm", cmd: "npm --version && pnpm --version 2>/dev/null || echo 'pnpm not installed'" },
    { label: "Cek PM2", cmd: "pm2 --version 2>/dev/null || echo 'PM2 not installed'" },
    { label: "Cek Git", cmd: "git --version" },
  ],
  install: [
    { label: "Install Node.js 20 (Ubuntu/Debian)", cmd: "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs" },
    { label: "Install pnpm", cmd: "npm install -g pnpm" },
    { label: "Install PM2", cmd: "npm install -g pm2" },
    { label: "Install tsx (TypeScript runner)", cmd: "npm install -g tsx" },
  ],
  deploy: [
    { label: "Clone project", cmd: "git clone <YOUR_REPO_URL> hoodbot && cd hoodbot" },
    { label: "Install dependencies", cmd: "pnpm install" },
    { label: "Copy env file", cmd: "cp .env.example .env && nano .env" },
    { label: "Jalankan bot dengan PM2", cmd: "pm2 start --name hoodbot 'pnpm run bot:dev'" },
    { label: "Auto-start saat reboot", cmd: "pm2 startup && pm2 save" },
    { label: "Lihat logs PM2", cmd: "pm2 logs hoodbot" },
    { label: "Restart bot", cmd: "pm2 restart hoodbot" },
    { label: "Stop bot", cmd: "pm2 stop hoodbot" },
  ],
};

function CopyableCommand({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded bg-background border border-border px-3 py-2 font-mono text-xs group">
      <code className="text-primary flex-1 break-all select-all">{cmd}</code>
      <button
        onClick={copy}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded border border-transparent hover:border-border text-xs"
        aria-label="Copy command"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function VpsPanel() {
  const [activeTab, setActiveTab] = useState<"check" | "install" | "deploy">("check");

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: "check", label: "Cek VPS" },
    { key: "install", label: "Install Dependencies" },
    { key: "deploy", label: "Deploy Bot" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Setup VPS (Long Polling Mode)
        </h3>
        <span className="text-xs font-mono text-muted-foreground/60 border border-border/50 rounded px-2 py-0.5">
          Dijalankan di VPS kamu, bukan Vercel
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-xs font-mono transition-colors ${
              activeTab === tab.key
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 flex flex-col gap-3">
        {COMMANDS[activeTab].map(({ label, cmd }) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="text-xs font-mono text-muted-foreground">{label}</span>
            <CopyableCommand cmd={cmd} />
          </div>
        ))}

        {activeTab === "deploy" && (
          <div className="mt-2 rounded border border-yellow-500/30 bg-yellow-500/5 px-3 py-2">
            <p className="text-xs font-mono text-yellow-500/80">
              Catatan: Saat menjalankan bot dengan PM2 (long polling), pastikan Telegram Webhook
              sudah di-delete terlebih dahulu agar tidak conflict. Jalankan:
            </p>
            <CopyableCommand
              cmd={`curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
