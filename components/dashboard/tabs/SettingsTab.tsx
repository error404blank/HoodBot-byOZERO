"use client";

interface SettingsTabProps {
  user: {
    username: string | null;
    firstName: string | null;
    telegramId: string;
  };
  onLogout: () => void;
}

export function SettingsTab({ user, onLogout }: SettingsTabProps) {
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-xl">
      <div>
        <h2 className="text-base font-mono font-bold text-foreground">Settings</h2>
        <p className="text-xs font-mono text-muted-foreground mt-0.5">Informasi akun dan preferensi.</p>
      </div>

      {/* Account info */}
      <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
        <div className="px-4 py-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Akun Telegram</p>
          <div className="space-y-2">
            {user.firstName && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">Nama</span>
                <span className="text-sm font-mono text-foreground">{user.firstName}</span>
              </div>
            )}
            {user.username && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">Username</span>
                <span className="text-sm font-mono text-foreground">@{user.username}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">Telegram ID</span>
              <span className="text-sm font-mono text-foreground">{user.telegramId}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Session info */}
      <div className="rounded-lg border border-border bg-card px-4 py-4 space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Session</p>
        <p className="text-xs font-mono text-muted-foreground">Session aktif. Login valid selama 7 hari sejak login terakhir.</p>
      </div>

      {/* About */}
      <div className="rounded-lg border border-border bg-card px-4 py-4 space-y-1">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Tentang HoodBot</p>
        <p className="text-xs font-mono text-muted-foreground">NFTHood console untuk manajemen wallet, mint NFT multi-chain, dan LP positions di Robinhood Chain.</p>
        <p className="text-[11px] font-mono text-muted-foreground/50 mt-1">v2.0 — HoodBot by OZERO</p>
      </div>

      {/* Logout */}
      <button
        onClick={onLogout}
        className="w-full py-3 rounded border border-destructive/30 bg-destructive/5 text-destructive text-sm font-mono font-semibold hover:bg-destructive/10 transition-colors"
      >
        Logout
      </button>
    </div>
  );
}
