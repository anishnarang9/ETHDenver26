import Link from "next/link";
import {
  ArrowRight,
  Check,
  Coins,
  ShieldCheck,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

<<<<<<< HEAD
const stats = [
  { label: "Active Agents", value: "5" },
  { label: "Settlements Today", value: "31" },
  { label: "Policy Pass Rate", value: "96.1%" },
  { label: "Chain", value: "Kite 2368" },
];

const pillars = [
  "Deterministic policy enforcement before every tool call",
  "On-chain payment verification with x402 challenge + proof flow",
  "Live multi-agent orchestration across planner and specialists",
];

const flow = ["Human request", "Planner orchestration", "Policy checks", "x402 payment", "On-chain receipt", "Mission output"];

export default function Home() {
  return (
    <div className="landing-clean relative overflow-hidden px-4 pb-20 pt-8 md:px-10">
      <div className="landing-orb landing-orb-a" />
      <div className="landing-orb landing-orb-b" />
      <div className="mx-auto w-full max-w-[1880px]">
        <section className="pt-8 md:pt-12">
          <div className="landing-hero-grid items-center gap-8">
            <div>
              <p className="mb-6 inline-flex rounded-full border border-accent-cyan/35 bg-accent-cyan/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-accent-cyan">
                TripDesk v2
              </p>
              <h1 className="title-font max-w-[18ch] text-5xl font-semibold leading-[0.95] tracking-tight text-text-0 md:text-7xl xl:text-8xl">
                Mission Control for Autonomous Web3 Agents
              </h1>
              <p className="mt-7 max-w-3xl text-lg text-text-1 md:text-xl">
                One place to orchestrate agents, enforce policy, and verify every payment path from challenge to on-chain receipt.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/dashboard" className="landing-btn-primary">
                  Enter Dashboard <ArrowRight size={16} />
                </Link>
                <Link href="/missions" className="landing-btn-secondary">
                  Explore Missions
                </Link>
                <ThemeToggle className="rounded-xl border border-line bg-bg-1/80 px-4 py-2.5 text-sm text-text-1 hover:text-text-0" />
              </div>
            </div>
            <div className="crypto-scene-wrap">
              <div className="crypto-scene">
                <div className="scene-orbit scene-orbit-a" />
                <div className="scene-orbit scene-orbit-b" />
                <div className="scene-plane" />
                <div className="scene-core" />
                <div className="chain-cube cube-a" />
                <div className="chain-cube cube-b" />
                <div className="chain-cube cube-c" />
                <span className="scene-particle particle-a" />
                <span className="scene-particle particle-b" />
                <span className="scene-particle particle-c" />
                <span className="scene-particle particle-d" />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 border-y border-line/60 py-3">
          <div className="landing-marquee mono">
            <span>
              BLOCK 990214 | RECEIPT VERIFIED | PASSPORT CHECK PASS | CHALLENGE ISSUED | PROOF ACCEPTED | DAILY CAP 88% |
            </span>
            <span>
              BLOCK 990214 | RECEIPT VERIFIED | PASSPORT CHECK PASS | CHALLENGE ISSUED | PROOF ACCEPTED | DAILY CAP 88% |
            </span>
          </div>
        </section>

        <section className="mt-10 grid gap-5 border-b border-line/60 pb-10 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-xs uppercase tracking-[0.18em] text-text-1">{stat.label}</p>
              <p className="mono mt-2 text-3xl text-text-0">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-14 grid gap-12 xl:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h2 className="title-font text-4xl md:text-5xl">Built For High-Stakes Agent Operations</h2>
            <div className="mt-8 space-y-4">
              {pillars.map((item) => (
                <p key={item} className="flex items-start gap-3 text-base text-text-1 md:text-lg">
                  <Check size={18} className="mt-1 shrink-0 text-accent-cyan" />
                  <span>{item}</span>
                </p>
              ))}
            </div>
          </div>
          <div className="landing-gradient-line">
            <div className="space-y-6 pl-5">
              <p className="flex items-center gap-2 text-lg"><ShieldCheck size={18} className="text-accent-cyan" /> Enforcement</p>
              <p className="flex items-center gap-2 text-lg"><Coins size={18} className="text-accent-cyan" /> Payment</p>
              <p className="flex items-center gap-2 text-lg"><Waypoints size={18} className="text-accent-cyan" /> Orchestration</p>
              <p className="flex items-center gap-2 text-lg"><Sparkles size={18} className="text-accent-cyan" /> Observability</p>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <p className="mb-5 text-xs uppercase tracking-[0.2em] text-text-1">Mission Lifecycle</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            {flow.map((step, index) => (
              <div key={step} className="border-l border-accent-cyan/40 pl-3">
                <p className="mono text-xs text-accent-cyan">{String(index + 1).padStart(2, "0")}</p>
                <p className="mt-1 text-sm text-text-0">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 border-t border-line/60 pt-10">
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="title-font text-3xl md:text-4xl">Ready to run your next autonomous mission?</h3>
              <p className="mt-2 text-base text-text-1">Launch into live telemetry, agent controls, and payment verification.</p>
            </div>
            <Link href="/dashboard" className="landing-btn-primary">
              Launch Dashboard <ArrowRight size={16} />
            </Link>
          </div>
          <div>
            <p className="mono mt-8 text-xs uppercase tracking-[0.2em] text-text-1">
              Trusted by builders shipping autonomous systems under real financial constraints.
            </p>
          </div>
        </section>
      </div>
    </div>
=======
import { SetupWizard } from "../components/setup-wizard";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0f",
        color: "#e2e8f0",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 800,
            background: "linear-gradient(135deg, #38bdf8, #818cf8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.02em",
          }}
        >
          TripDesk
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: "1rem",
            color: "#64748b",
            fontWeight: 400,
          }}
        >
          AI Travel Agent Console
        </p>
      </div>

      {/* Setup Wizard */}
      <SetupWizard />
    </main>
>>>>>>> vitthal
  );
}
