"use client";

import { useState } from "react";

export type TabId = "home" | "wallets" | "nfthood" | "send" | "rpcs" | "positions" | "settings";

const NAV_ITEMS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: "home",
    label: "Home",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 6.5L8 2l6 4.5V14H10v-3H6v3H2V6.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
  {
    id: "wallets",
    label: "Wallets",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1 7h14" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="12" cy="10" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "nfthood",
    label: "NFTHood",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5 11l2.5-4 2 3 1.5-2 2 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "send",
    label: "Send",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 2l12 6-12 6V9.5L9 8 2 6.5V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "rpcs",
    label: "RPCs",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 2.5C8 2.5 5.5 5 5.5 8s2.5 5.5 2.5 5.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 2.5C8 2.5 10.5 5 10.5 8s-2.5 5.5-2.5 5.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M2.5 8h11" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    id: "positions",
    label: "Positions",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 12l3.5-4 3 3 2.5-5 3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  user: { username?: string | null; firstName?: string | null } | null;
  onLogout: () => void;
}

export function Sidebar({ activeTab, onTabChange, user, onLogout }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const displayName = user?.firstName ?? user?.username ?? "User";

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border/50 flex items-center gap-3">
        <div className="w-7 h-7 rounded bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
          <span className="text-primary font-mono font-bold text-xs">H</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-mono font-bold text-foreground leading-none">HoodBot</p>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">CONSOLE</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { onTabChange(item.id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-left transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <span className={`shrink-0 ${isActive ? "text-primary" : ""}`}>{item.icon}</span>
              <span className="text-sm font-mono">{item.label}</span>
              {isActive && (
                <span className="ml-auto w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-3 border-t border-border/50 space-y-2">
        <div className="flex items-center gap-2 px-2">
          <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-mono text-primary font-bold">
              {displayName[0]?.toUpperCase()}
            </span>
          </div>
          <span className="text-xs font-mono text-muted-foreground truncate">{displayName}</span>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-mono text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 7h7M9.5 4.5L12 7l-2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 2H3a1 1 0 00-1 1v8a1 1 0 001 1h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Logout
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-border/50 bg-sidebar h-screen sticky top-0">
        <NavContent />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border/50 bg-sidebar sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-primary font-mono font-bold text-[10px]">H</span>
          </div>
          <span className="text-sm font-mono font-bold text-foreground">HoodBot</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 text-muted-foreground hover:text-foreground"
          aria-label="Open menu"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-60 bg-sidebar h-full flex flex-col border-r border-border/50 z-10">
            <div className="flex items-center justify-end px-3 pt-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Close menu"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <NavContent />
          </div>
        </div>
      )}
    </>
  );
}
