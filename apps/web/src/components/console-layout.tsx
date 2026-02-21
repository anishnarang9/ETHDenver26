"use client";

import { useSSEState } from "../lib/sse-context";
import { AgentBrowserPanel } from "./agent-browser-panel";
import { EmailThread } from "./email-thread";
import { EnforcementPipeline } from "./enforcement-pipeline";
import { MissionControl } from "./mission-control";
import { WalletBalances } from "./wallet-balances";
import { ReplayButton } from "./replay-button";

const agentWallets = [
  { name: "Planner", address: process.env.NEXT_PUBLIC_PLANNER_ADDRESS || "", color: "#3b82f6" },
  { name: "Rider", address: process.env.NEXT_PUBLIC_RIDER_ADDRESS || "", color: "#22d3ee" },
  { name: "Foodie", address: process.env.NEXT_PUBLIC_FOODIE_ADDRESS || "", color: "#f59e0b" },
  { name: "EventBot", address: process.env.NEXT_PUBLIC_EVENTBOT_ADDRESS || "", color: "#ef4444" },
].filter((w) => w.address);

export function ConsoleLayout({ plannerUrl }: { plannerUrl: string }) {
  const { state } = useSSEState();

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid #1e293b" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, background: "linear-gradient(135deg, #38bdf8, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            TripDesk Console
          </h1>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>Multi-Agent Travel Concierge on Kite</p>
        </div>
        <ReplayButton plannerUrl={plannerUrl} />
      </div>

      {/* Browser Panels Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", padding: "12px 24px" }}>
        <AgentBrowserPanel
          agentId="rider"
          label="Rider"
          browser={state.browsers.rider}
          thought={state.thoughts.rider}
        />
        <AgentBrowserPanel
          agentId="foodie"
          label="Foodie"
          browser={state.browsers.foodie}
          thought={state.thoughts.foodie}
        />
        <AgentBrowserPanel
          agentId="eventbot"
          label="EventBot"
          browser={state.browsers.eventbot}
          thought={state.thoughts.eventbot}
        />
      </div>

      {/* Bottom Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", padding: "0 24px 24px" }}>
        {/* Left: Email + Enforcement */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <EmailThread emails={state.emails} />
          <EnforcementPipeline steps={state.enforcementSteps} />
        </div>
        {/* Right: Wallet Balances + Mission Control */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {agentWallets.length > 0 && <WalletBalances wallets={agentWallets} />}
          <MissionControl
            transactions={state.transactions}
            plannerUrl={plannerUrl}
            plannerAddress={process.env.NEXT_PUBLIC_PLANNER_ADDRESS}
            riderAddress={process.env.NEXT_PUBLIC_RIDER_ADDRESS}
            foodieAddress={process.env.NEXT_PUBLIC_FOODIE_ADDRESS}
            eventbotAddress={process.env.NEXT_PUBLIC_EVENTBOT_ADDRESS}
          />
        </div>
      </div>
    </div>
  );
}
