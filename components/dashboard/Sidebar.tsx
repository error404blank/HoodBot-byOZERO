"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useLang } from "@/lib/useLang";
import { LANGUAGES } from "@/lib/i18n";

export type TabId = "home" | "wallets" | "nfthood" | "send" | "rpcs" | "positions" | "tokencheck" | "settings";

interface NavItem {
  id: TabId;
  labelKey: keyof ReturnType<typeof useLang>["tr"];
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "home",
    labelKey: "home",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 6.5L8 2l6 4.5V14H10v-3H6v3H2V6.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
  {
    id: "wallets",
    labelKey: "wallets",
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
    labelKey: "nfthood",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5 11l2.5-4 2 3 1.5-2 2 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "send",
    labelKey: "send",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 2l12 6-12 6V9.5L9 8 2 6.5V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "tokencheck",
    labelKey: "tokencheck",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M7 5v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "rpcs",
    labelKey: "rpcs",
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
    labelKey: "positions",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 12l3.5-4 3 3 2.5-5 3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "settings",
    labelKey: "settings",
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
  const { lang, setLang, tr } = useLang();

  const displayName = user?.firstName ?? user?.username ?? "User";

  useEffect(() => {
    const handler = () => setMobileOpen(true);
    window.addEventListener("hoodbot:open-menu", handler);
    return () => window.removeEventListener("hoodbot:open-menu", handler);
  }, []);

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border/50 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-primary/30">
          <Image src="/hoodbot-logo.png" alt="HoodBot" width={32} height={32} className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-mono font-bold text-foreground leading-none">HoodBot</p>
          <p className="text-[10px] font-mono text-primary/70 mt-0.5 tracking-widest">CONSOLE</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          const label = tr[item.labelKey] as string;
          return (
            <button
              key={item.id}
              onClick={() => { onTabChange(item.id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-left transition-all duration-150 ${
                isActive
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"
              }`}
            >
              <span className={`shrink-0 ${isActive ? "text-primary" : ""}`}>{item.icon}</span>
              <span className="text-sm font-mono">{label}</span>
              {isActive && <span className="ml-auto w-1 h-1 rounded-full bg-primary shrink-0" />}
            </button>
          );
        })}
      </nav>

      {/* Language toggle */}
      <div className="px-3 py-2 border-t border-border/50 shrink-0">
        <p className="text-[10px] font-mono text-muted-foreground/60 mb-1.5 px-1 uppercase tracking-wider">{tr.language}</p>
        <div className="flex gap-1">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`flex-1 py-1.5 rounded text-[11px] font-mono font-bold transition-colors ${
                lang === l.code
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent"
              }`}
            >
              {l.flag}
            </button>
          ))}
        </div>
      </div>

      {/* User + logout */}
      <div className="px-3 py-3 border-t border-border/50 space-y-2 shrink-0">
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
          {tr.logout}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-border/50 bg-sidebar h-screen sticky top-0">
        <NavContent />
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-60 bg-sidebar h-full flex flex-col border-r border-border/50 z-10">
            <div className="flex items-center justify-end px-3 pt-3 shrink-0">
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
            <div className="flex-1 overflow-y-auto">
              <NavContent />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
