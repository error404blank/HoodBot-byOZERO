"use client";

import { useEffect, useState } from "react";
import { LoginScreen } from "./LoginScreen";
import { Sidebar, type TabId } from "./Sidebar";
import { HomeTab } from "./tabs/HomeTab";

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
      case "home":       return <HomeTab />;
      case "wallets":    return <WalletsTab />;
      case "nfthood":    return <NftHoodTab />;
      case "send":       return <SendTab />;
      case "rpcs":       return <RpcsTab />;
      case "positions":  return <PositionsTab />;
      case "settings":   return <SettingsTab user={user!} onLogout={handleLogout} />;
      default:           return <HomeTab />;
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        onLogout={handleLogout}
      />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Top bar */}
        <div className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border/50 bg-card/30 sticky top-0 z-10 backdrop-blur-sm">
          <h1 className="text-sm font-mono font-semibold text-foreground capitalize">
            {activeTab === "nfthood" ? "NFTHood" : activeTab}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">
              {user.username ? `@${user.username}` : user.firstName ?? ""}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-primary" title="Session active" />
          </div>
        </div>

        {/* Tab content */}
        <div className="w-full">{renderTab()}</div>
      </main>
    </div>
  );
}
