"use client";

import { useEffect, useState } from "react";
import { LoginScreen } from "./LoginScreen";
import { Sidebar, type TabId } from "./Sidebar";
import { HomeTab } from "./tabs/HomeTab";
import { useLang } from "@/lib/useLang";

// Lazy imports for tabs — loaded inline to keep bundle splits minimal
import dynamic from "next/dynamic";

const WalletsTab = dynamic(() => import("./tabs/WalletsTab").then((m) => ({ default: m.WalletsTab })), {
  loading: () => <TabSkeleton />,
});
const NftHoodTab = dynamic(() => import("./tabs/NftHoodTab").then((m) => ({ default: m.NftHoodTab })), {
  loading: () => <TabSkeleton />,
});
const SendTab = dynamic(() => import("./tabs/SendTab").then((m) => ({ default: m.SendTab })), {
  loading: () => <TabSkeleton />,
});
const RpcsTab = dynamic(() => import("./tabs/RpcsTab").then((m) => ({ default: m.RpcsTab })), {
  loading: () => <TabSkeleton />,
});
const PositionsTab = dynamic(() => import("./tabs/PositionsTab").then((m) => ({ default: m.PositionsTab })), {
  loading: () => <TabSkeleton />,
});
const SettingsTab = dynamic(() => import("./tabs/SettingsTab").then((m) => ({ default: m.SettingsTab })), {
  loading: () => <TabSkeleton />,
});
const TokenCheckTab = dynamic(() => import("./tabs/TokenCheckTab").then((m) => ({ default: m.TokenCheckTab })), {
  loading: () => <TabSkeleton />,
});

function TabSkeleton() {
  return (
    <div className="p-6 space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-lg border border-border bg-card animate-pulse" />
      ))}
    </div>
  );
}

interface AuthUser {
  id: number;
  username: string | null;
  firstName: string | null;
  telegramId: string;
}

export function DashboardShell() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const { tr } = useLang();

  // Check session on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const data = d as { user: AuthUser | null };
        setUser(data.user);
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  function handleLogin(_token: string) {
    // Re-fetch user after cookie is set
    setTimeout(() => {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((d) => {
          const data = d as { user: AuthUser | null };
          setUser(data.user);
        });
    }, 500);
  }

  // Loading state — brief flash while checking session
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-mono text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  function renderTab() {
    switch (activeTab) {
      case "home":        return <HomeTab />;
      case "wallets":     return <WalletsTab />;
      case "nfthood":     return <NftHoodTab />;
      case "send":        return <SendTab />;
      case "rpcs":        return <RpcsTab />;
      case "positions":   return <PositionsTab />;
      case "tokencheck":  return <TokenCheckTab />;
      case "settings":    return <SettingsTab user={user!} onLogout={handleLogout} />;
      default:            return <HomeTab />;
    }
  }

  // Use translated label for the active tab
  const TAB_LABEL_KEYS: Record<TabId, keyof typeof tr> = {
    home: "home", wallets: "wallets", nfthood: "nfthood", send: "send",
    rpcs: "rpcs", positions: "positions", tokencheck: "tokencheck", settings: "settings",
  };
  const tabLabel = tr[TAB_LABEL_KEYS[activeTab]] as string;

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar — only renders md+ */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main column — fills full width on mobile, rest on desktop */}
      <div className="flex-1 min-w-0 flex flex-col h-dvh overflow-hidden">

        {/* Desktop top bar */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border/50 bg-card/30 shrink-0 backdrop-blur-sm">
          <h1 className="text-sm font-mono font-semibold text-foreground">{tabLabel}</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">
              {user.username ? `@${user.username}` : user.firstName ?? ""}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-primary" title="Session active" />
          </div>
        </header>

        {/* Mobile top bar — full width sticky header */}
        <header className="md:hidden shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/50 bg-sidebar sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center">
              <span className="text-primary font-mono font-bold text-xs">H</span>
            </div>
            <div>
              <span className="text-sm font-mono font-bold text-foreground">HoodBot</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-2 opacity-70">{tabLabel}</span>
            </div>
          </div>
          <button
            onClick={() => {
              // Trigger mobile drawer in Sidebar via a custom event
              window.dispatchEvent(new CustomEvent("hoodbot:open-menu"));
            }}
            className="p-2 -mr-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-white/5 transition-colors"
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto overscroll-contain">
          {renderTab()}
        </main>
      </div>
    </div>
  );
}
