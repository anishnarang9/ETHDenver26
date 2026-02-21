"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Bell, Command, LayoutDashboard, Radar, ReceiptText, Settings, ShieldCheck, Sparkles } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/missions", label: "Missions", icon: Radar },
  { href: "/enforcement", label: "Enforcement", icon: ShieldCheck },
  { href: "/agents", label: "Agents", icon: Sparkles },
  { href: "/payments", label: "Payments", icon: ReceiptText },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/styleguide", label: "Styleguide", icon: Command },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="scanline">
      <div className="content-layer flex min-h-screen">
        <aside className="data-grid hidden w-64 flex-col border-r border-line bg-bg-0/85 p-4 lg:flex">
          <div className="mb-8 mt-2">
            <p className="text-xs uppercase tracking-[0.2em] text-text-1">TripDesk</p>
            <h1 className="title-font mt-2 text-2xl font-semibold text-text-0">Mission Control</h1>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-1 transition",
                    active ? "text-text-0" : "hover:bg-bg-2/65 hover:text-text-0"
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="active-nav"
                      className="absolute inset-0 rounded-xl border border-accent-blue/40 bg-accent-blue/15"
                      transition={{ type: "spring", stiffness: 260, damping: 26 }}
                    />
                  ) : null}
                  <Icon size={16} className="relative z-10" />
                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-xl border border-line bg-bg-1 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-text-1">Environment</p>
            <p className="mono mt-1 text-sm text-accent-cyan">demo-testnet</p>
          </div>
        </aside>

        <main className="w-full">
          <div className="sticky top-0 z-20 border-b border-line/80 bg-bg-0/85 backdrop-blur">
            <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 md:px-6">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-text-1">Current Mission</p>
                <p className="mono text-sm text-text-0">M-2026-0217-DEN</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded-lg border border-line bg-bg-1 px-3 py-1.5 text-sm text-text-1 hover:text-text-0">
                  <Bell size={14} className="mr-1 inline-block" />
                  Alerts
                </button>
                <button className="rounded-lg border border-accent-cyan/40 bg-accent-cyan/15 px-3 py-1.5 text-sm text-accent-cyan">
                  Start Mission
                </button>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-[1400px] p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
