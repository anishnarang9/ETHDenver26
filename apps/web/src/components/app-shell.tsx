"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Compass,
  LayoutGrid,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  Waypoints,
  Zap,
} from "lucide-react";
import { isSetupComplete } from "../lib/setup-state";
import { SSEProvider } from "../lib/sse-context";

const navItems = [
  { href: "/console", label: "Dashboard", icon: LayoutGrid },
  { href: "/setup", label: "Setup", icon: Compass },
  { href: "/timeline", label: "Enforcement", icon: Waypoints },
  { href: "/guardrails", label: "Agents", icon: ShieldCheck },
];

function StatusChip({ label, value, ok = true }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="chip" role="status" aria-label={`${label} ${value}`}>
      <span className="chip-dot" style={{ background: ok ? "var(--accent-lime)" : "var(--accent-red)" }} />
      <span className="chip-label">{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <div className="app-footer-brand">
          <Image src="/logo.png" alt="Actuate logo" width={18} height={18} />
          <span>Actuate</span>
        </div>
        <p className="app-footer-copy">Autonomous Agent Commerce Infrastructure</p>
        <span className="app-footer-meta">© {year} Actuate</span>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const plannerUrl = process.env.NEXT_PUBLIC_PLANNER_URL || "http://localhost:4005";
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4001";
  const chain = process.env.NEXT_PUBLIC_CHAIN_ID || "2368";
  const [ready, setReady] = useState(false);
  const [setupComplete, setSetupCompleteState] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const hostOf = (value: string) => {
    try {
      return new URL(value).host;
    } catch {
      return value;
    }
  };

  const isSetupRoute = pathname === "/setup";
  const isLandingRoute = pathname === "/";
  const isFunnelRoute = isLandingRoute || isSetupRoute;
  const canBypassGate = isSetupRoute || isLandingRoute;

  useEffect(() => {
    setSetupCompleteState(isSetupComplete());
    setReady(true);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored =
        window.localStorage.getItem("actuate_theme_v1") || window.localStorage.getItem("tripdesk_theme_v1");
      const nextTheme =
        stored === "light" || stored === "dark"
          ? stored
          : window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
      setTheme(nextTheme);
      document.documentElement.setAttribute("data-theme", nextTheme);
    } catch {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("actuate_theme_v1", next);
      window.localStorage.removeItem("tripdesk_theme_v1");
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!setupComplete && !canBypassGate) {
      router.replace("/setup");
    }
  }, [canBypassGate, ready, router, setupComplete]);

  const visibleNavItems = useMemo(() => {
    if (setupComplete) {
      return navItems.filter((item) => item.href !== "/setup");
    }
    return navItems.filter((item) => item.href === "/" || item.href === "/setup");
  }, [setupComplete]);

  if (isFunnelRoute) {
    return (
      <div className="app-shell-stack">
        <div className={isLandingRoute ? "landing-page-shell" : "setup-page-shell"}>
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle light and dark mode">
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          {children}
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="shell-loading">
        <div className="chip">
          <span className="chip-dot" />
          <span className="chip-label">Booting Actuate Console</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell-stack">
      <SSEProvider url={`${plannerUrl}/api/events`}>
        <div className="shell">
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle light and dark mode">
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          <aside className="left-rail">
            <div className="rail-brand">
              <div className="rail-brand-lockup">
                <Image src="/logo.png" alt="Actuate logo" width={28} height={28} />
                <p className="rail-logo">Actuate</p>
              </div>
              <p className="rail-tag">Autonomous Agent Console</p>
            </div>

            <nav className="rail-nav" aria-label="Primary navigation">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} className={`nav-link${isActive ? " active" : ""}`}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="rail-footer">
              <span className="badge ok">Kite Testnet</span>
              {!setupComplete && <span className="badge warn">Setup Locked</span>}
            </div>
          </aside>

          <div className="main-frame">
            <header className="utility-bar">
              <div className="search-wrap">
                <Search size={14} color="var(--text-1)" />
                <input className="search-input" placeholder="Command search (runs, actions, tx hash)" />
              </div>

              <div className="utility-right">
                <div className="chip mission-chip">
                  <Zap size={12} />
                  <span className="chip-label">Mission</span>
                  <span className="mono">Live</span>
                </div>
                <StatusChip label="Planner" value={hostOf(plannerUrl)} />
                <StatusChip label="Gateway" value={hostOf(gatewayUrl)} />
                <StatusChip label="Chain" value={chain} />
                <StatusChip
                  label="Wallet"
                  value={(process.env.NEXT_PUBLIC_PLANNER_ADDRESS || "not-set").slice(0, 10)}
                  ok={Boolean(process.env.NEXT_PUBLIC_PLANNER_ADDRESS)}
                />
              </div>
            </header>

            {!setupComplete && !isSetupRoute && (
              <div className="notice">
                Setup is required before operations. Complete the guided flow to unlock Operations, Enforcement, and Agent controls.
              </div>
            )}

            <main className="canvas-card">{children}</main>
          </div>
        </div>
      </SSEProvider>
      <SiteFooter />
    </div>
  );
}
