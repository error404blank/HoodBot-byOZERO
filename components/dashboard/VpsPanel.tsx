"use client";

import { useState } from "react";

function CopyableCommand({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded bg-background border border-border px-3 py-2 font-mono text-xs">
      <code className="text-primary flex-1 break-all select-all leading-relaxed">{cmd}</code>
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

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-yellow-500/30 bg-yellow-500/5 px-3 py-2.5">
      <p className="text-xs font-mono text-yellow-400/90 leading-relaxed">{children}</p>
    </div>
  );
}

function StepBlock({
  number,
  title,
  description,
  commands,
  note,
}: {
  number: string;
  title: string;
  description?: string;
  commands: string[];
  note?: string;
}) {
  return (
    <div className="flex gap-4">
      {/* Step number */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
          <span className="text-xs font-mono font-bold text-primary">{number}</span>
        </div>
        <div className="w-px flex-1 bg-border/50 min-h-[8px]" />
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2 pb-5 flex-1 min-w-0">
        <span className="text-sm font-mono font-semibold text-foreground leading-tight">{title}</span>
        {description && (
          <p className="text-xs font-mono text-muted-foreground leading-relaxed">{description}</p>
        )}
        {commands.map((cmd) => (
          <CopyableCommand key={cmd} cmd={cmd} />
        ))}
        {note && <Note>{note}</Note>}
      </div>
    </div>
  );
}

export function VpsPanel() {
  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Setup VPS — Panduan Lengkap
        </h3>
        <span className="shrink-0 text-xs font-mono text-muted-foreground/60 border border-border/50 rounded px-2 py-0.5">
          Jalankan di terminal VPS
        </span>
      </div>

      {/* Intro */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs font-mono text-muted-foreground leading-relaxed">
          Ikuti langkah di bawah secara berurutan. Setiap langkah dijalankan di terminal VPS kamu lewat SSH.
          Klik <span className="text-foreground">Copy</span> untuk menyalin perintah, lalu paste di terminal.
          Jangan tutup terminal atau tekan Ctrl+C saat perintah masih berjalan.
        </p>
      </div>

      {/* Steps */}
      <div className="px-4 pt-4 pb-2">
        <StepBlock
          number="1"
          title="Cek kondisi VPS"
          description="Jalankan satu per satu untuk tahu apa yang sudah terinstall. Catat hasilnya."
          commands={[
            "node --version",
            "git --version",
            "pm2 --version",
          ]}
        />

        <StepBlock
          number="2"
          title="Install Node.js 20 (jika node --version belum ada atau di bawah v18)"
          description="Lewati step ini jika node --version sudah menampilkan v18 atau lebih."
          commands={[
            "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -",
            "sudo apt-get install -y nodejs",
          ]}
        />

        <StepBlock
          number="3"
          title="Install pnpm, PM2, dan tsx"
          description="Tunggu sampai selesai penuh — jangan tekan Ctrl+C. Ketiga tools ini wajib ada sebelum lanjut."
          commands={[
            "npm install -g pnpm pm2 tsx",
          ]}
        />

        <StepBlock
          number="4"
          title="Clone repository HoodBot dari GitHub"
          description="Mengunduh seluruh source code ke folder 'hoodbot'. Jalankan dari home directory kamu (~)."
          commands={[
            "cd ~",
            "git clone https://github.com/error404blank/HoodBot-byOZERO.git hoodbot",
            "cd hoodbot",
          ]}
        />

        <StepBlock
          number="5"
          title="Install semua dependencies"
          description="Tunggu sampai selesai. Di akhir akan muncul pesan ERR_PNPM_IGNORED_BUILDS — itu normal, bukan error fatal. Lanjutkan ke perintah berikutnya."
          commands={[
            "pnpm install",
            "pnpm approve-builds",
          ]}
          note="Saat pnpm approve-builds muncul daftar interaktif, tekan Space untuk pilih semua item lalu tekan Enter untuk konfirmasi."
        />

        <StepBlock
          number="6"
          title="Buat file .env dan isi konfigurasi"
          description="Buat file .env dari template lalu isi nilainya. Gunakan panel '.env File Generator' di bawah halaman ini untuk menyalin template lengkap."
          commands={[
            "cp .env.example .env",
            "nano .env",
          ]}
          note="Di dalam nano: isi TELEGRAM_BOT_TOKEN dan DATABASE_URL. Setelah selesai tekan Ctrl+O lalu Enter untuk save, kemudian Ctrl+X untuk keluar."
        />

        <StepBlock
          number="7"
          title="Hapus Webhook Telegram (wajib jika pernah pakai Webhook mode)"
          description="Jika sebelumnya kamu mendaftarkan webhook lewat dashboard ini, hapus dulu. Long polling dan webhook tidak bisa aktif bersamaan — salah satu akan diabaikan Telegram."
          commands={[
            `curl "https://api.telegram.org/bot$(grep TELEGRAM_BOT_TOKEN .env | cut -d= -f2)/deleteWebhook"`,
          ]}
        />

        <StepBlock
          number="8"
          title="Jalankan bot dengan PM2"
          description="PM2 menjaga bot tetap berjalan meski terminal ditutup dan otomatis restart jika crash."
          commands={[
            "pm2 start --name hoodbot 'pnpm run bot:dev'",
          ]}
          note="Setelah start, tunggu 5 detik lalu cek logs. Kamu akan melihat '[HoodBot] Running as @username' jika berhasil. Jika muncul error, paste logs di sini."
        />

        <StepBlock
          number="9"
          title="Verifikasi bot berjalan"
          description="Cek status PM2 dan lihat logs terakhir untuk memastikan tidak ada crash."
          commands={[
            "pm2 status",
            "pm2 logs hoodbot --lines 20 --nostream",
          ]}
        />

        <StepBlock
          number="10"
          title="Set PM2 auto-start saat VPS reboot"
          description="Jalankan kedua perintah ini agar bot otomatis aktif kembali setelah VPS di-restart."
          commands={[
            "pm2 startup",
            "pm2 save",
          ]}
        />
      </div>

      {/* Update guide */}
      <div className="mx-4 mb-4 rounded border border-primary/20 bg-primary/5 p-3">
        <p className="text-xs font-mono text-primary mb-2 font-semibold">Cara update bot saat ada perubahan kode</p>
        <p className="text-xs font-mono text-muted-foreground mb-2 leading-relaxed">
          Setiap kali ada update dari GitHub, jalankan dua perintah ini dari folder ~/hoodbot:
        </p>
        <div className="flex flex-col gap-1.5">
          <CopyableCommand cmd="cd ~/hoodbot && git pull" />
          <CopyableCommand cmd="pm2 restart hoodbot" />
        </div>
      </div>

      {/* Quick reference */}
      <div className="mx-4 mb-4 mt-1 rounded border border-border bg-background/50 p-3">
        <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wider">Perintah PM2 sehari-hari</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: "Lihat status", cmd: "pm2 status" },
            { label: "Lihat logs live", cmd: "pm2 logs hoodbot" },
            { label: "Restart bot", cmd: "pm2 restart hoodbot" },
            { label: "Stop bot", cmd: "pm2 stop hoodbot" },
            { label: "Update & restart", cmd: "git pull && pm2 restart hoodbot" },
            { label: "Hapus dari PM2", cmd: "pm2 delete hoodbot" },
          ].map(({ label, cmd }) => (
            <div key={cmd} className="flex flex-col gap-1">
              <span className="text-xs font-mono text-muted-foreground/70">{label}</span>
              <CopyableCommand cmd={cmd} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
