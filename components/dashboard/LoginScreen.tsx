"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  onLogin: (token: string) => void;
}

type Step = "idle" | "waiting" | "confirmed" | "expired";

export function LoginScreen({ onLogin }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  useEffect(() => () => clearTimers(), []);

  async function requestCode() {
    setStep("waiting");
    const res = await fetch("/api/auth/code", { method: "POST" });
    const data = await res.json() as { code: string; expiresAt: string };
    setCode(data.code);
    const exp = new Date(data.expiresAt);
    setExpiresAt(exp);

    // Countdown timer
    timerRef.current = setInterval(() => {
      const secs = Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000));
      setSecondsLeft(secs);
      if (secs === 0) {
        clearTimers();
        setStep("expired");
      }
    }, 1000);

    // Poll every 2s for confirmation
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/auth/code?code=${data.code}`);
      const d = await r.json() as { status: string; token?: string };
      if (d.status === "confirmed" && d.token) {
        clearTimers();
        setStep("confirmed");
        // Set cookie via API then notify parent
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: d.token }),
        });
        onLogin(d.token);
      } else if (d.status === "expired") {
        clearTimers();
        setStep("expired");
      }
    }, 2000);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-widest text-primary">Online</span>
          </div>
          <h1 className="text-2xl font-mono font-bold text-foreground tracking-tight">HoodBot</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">CONSOLE v2</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          {step === "idle" && (
            <>
              <p className="text-sm font-mono text-muted-foreground leading-relaxed">
                Login menggunakan Telegram. Klik tombol di bawah, lalu kirim kode yang muncul ke bot.
              </p>
              <button
                onClick={requestCode}
                className="w-full py-3 rounded bg-primary text-primary-foreground text-sm font-mono font-semibold hover:bg-primary/90 transition-colors"
              >
                Login with Telegram
              </button>
              <p className="text-xs font-mono text-muted-foreground/60 text-center">
                Buka @HoodBot di Telegram setelah klik
              </p>
            </>
          )}

          {step === "waiting" && (
            <>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Langkah 1</p>
              <p className="text-sm font-mono text-muted-foreground">Kirim perintah ini ke bot Telegram:</p>
              <div className="rounded border border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3">
                <span className="font-mono text-xl font-bold text-primary tracking-[0.3em]">{code}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(`/login ${code}`)}
                  className="text-xs font-mono text-muted-foreground border border-border rounded px-2 py-1 hover:border-primary/40 hover:text-primary transition-colors shrink-0"
                >
                  Copy
                </button>
              </div>
              <div className="rounded border border-border bg-background/50 px-3 py-2">
                <p className="text-xs font-mono text-muted-foreground">Kirim ke bot:</p>
                <p className="text-sm font-mono text-foreground mt-0.5">/login {code}</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-mono text-muted-foreground">Menunggu konfirmasi bot...</span>
                </div>
                <span className={`text-xs font-mono ${secondsLeft < 60 ? "text-destructive" : "text-muted-foreground/60"}`}>
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                </span>
              </div>
              <button
                onClick={() => { clearTimers(); setStep("idle"); }}
                className="w-full py-2 text-xs font-mono text-muted-foreground border border-border rounded hover:border-primary/30 transition-colors"
              >
                Batal
              </button>
            </>
          )}

          {step === "confirmed" && (
            <div className="text-center py-4 space-y-2">
              <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mx-auto">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 9l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary" style={{ color: "var(--primary)" }} />
                </svg>
              </div>
              <p className="text-sm font-mono text-primary font-semibold">Login berhasil</p>
              <p className="text-xs font-mono text-muted-foreground">Memuat dashboard...</p>
            </div>
          )}

          {step === "expired" && (
            <>
              <p className="text-sm font-mono text-destructive">Kode kedaluwarsa.</p>
              <button
                onClick={() => { setStep("idle"); setCode(""); }}
                className="w-full py-2 text-sm font-mono bg-primary/10 text-primary border border-primary/30 rounded hover:bg-primary/20 transition-colors"
              >
                Coba Lagi
              </button>
            </>
          )}
        </div>

        <p className="text-xs font-mono text-muted-foreground/40 text-center mt-6">
          HoodBot — DeFi Console for Robinhood Chain
        </p>
      </div>
    </div>
  );
}
