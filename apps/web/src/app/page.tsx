"use client";

import { useState } from "react";
import { ActionInspector } from "../components/action-inspector";
import { PassportEditor } from "../components/passport-editor";
import { TimelinePanel } from "../components/timeline-panel";
import { WalletConnector } from "../components/wallet-connector";

export default function HomePage() {
  const [ownerAddress, setOwnerAddress] = useState<string>("");
  const [agentAddress, setAgentAddress] = useState<string>("");
  const [lastAction, setLastAction] = useState<string>("No recent actions");

  return (
    <main>
      <div className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>Agent Passport + Policy Vault + x402 Gateway</h1>
          <div className="meta">Kite testnet dashboard for owner onboarding + external customer agents</div>
        </div>
        <span className="badge">Owner Signs, Agent Keeps Keys</span>
      </div>

      <div className="grid">
        <div className="card-list">
          <WalletConnector onConnected={setOwnerAddress} />
          <PassportEditor
            ownerAddress={ownerAddress}
            onAgentChanged={setAgentAddress}
            onAction={(message) => setLastAction(message)}
          />
          <ActionInspector agentAddress={agentAddress} />
        </div>
        <div className="card-list">
          <div className="panel">
            <h2>Current Demo State</h2>
            <div className="meta">Owner: {ownerAddress || "not connected"}</div>
            <div className="meta">Agent: {agentAddress || "not set"}</div>
            <div className="status">Last action: {lastAction}</div>
            <div style={{ marginTop: 10 }}>
              <span className={agentAddress ? "badge" : "badge warn"}>{agentAddress ? "Passport Target Set" : "Awaiting Agent"}</span>
            </div>
          </div>
          <TimelinePanel agentAddress={agentAddress} />
        </div>
      </div>
    </main>
  );
}
