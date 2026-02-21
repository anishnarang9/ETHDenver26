"use client";

import { useState } from "react";
import { TransactionFeed } from "./transaction-feed";
import { revokePassportOnchain } from "../lib/onchain";
import { RefreshCw, ShieldAlert, ShieldOff, Plane } from "lucide-react";

interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: string;
  method: string;
  txHash?: string;
  status: "pending" | "complete" | "failed";
  timestamp: string;
}

export interface MissionControlProps {
  transactions: Transaction[];
  plannerUrl: string;
  plannerAddress?: string;
  riderAddress?: string;
  foodieAddress?: string;
  eventbotAddress?: string;
}

export function MissionControl({
  transactions,
  plannerUrl,
  plannerAddress,
  riderAddress,
  foodieAddress,
  eventbotAddress,
}: MissionControlProps) {
  const [actionStatus, setActionStatus] = useState<string>("");

  const triggerAction = async (action: string) => {
    setActionStatus(`Triggering ${action}...`);
    try {
      const res = await fetch(`${plannerUrl}/api/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setActionStatus(`${action}: started (run: ${data.runId?.slice(0, 8)})`);
    } catch (err) {
      setActionStatus(`Error: ${(err as Error).message}`);
    }
  };

  const resolvedEventbotAddress =
    eventbotAddress || process.env.NEXT_PUBLIC_EVENTBOT_ADDRESS || "";

  const handleRevoke = async () => {
    if (!resolvedEventbotAddress) {
      setActionStatus("Revoke error: no EventBot address configured");
      return;
    }
    setActionStatus("Revoking EventBot passport...");
    try {
      const result = await revokePassportOnchain({
        agentAddress: resolvedEventbotAddress,
      });
      setActionStatus(`EventBot revoked! Tx: ${result.txHash.slice(0, 12)}...`);
      setTimeout(() => triggerAction("post-revoke-test"), 2000);
    } catch (err) {
      setActionStatus(`Revoke error: ${(err as Error).message}`);
    }
  };

  return (
    <div style={{ background: "#111827", borderRadius: "12px", border: "1px solid #1e293b", padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <h3 style={{ margin: 0, fontSize: "0.9rem", color: "#94a3b8" }}>Mission Control</h3>

      {/* Action Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <button onClick={() => triggerAction("plan-trip")}
          style={{ padding: "10px", borderRadius: "8px", border: "none", background: "#3b82f6", color: "#fff", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <Plane size={14} /> Plan Trip
        </button>
        <button onClick={() => triggerAction("additional-search")}
          style={{ padding: "10px", borderRadius: "8px", border: "none", background: "#8b5cf6", color: "#fff", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <RefreshCw size={14} /> Additional Search
        </button>
        <button onClick={() => triggerAction("scope-violation")}
          style={{ padding: "10px", borderRadius: "8px", border: "none", background: "#f59e0b", color: "#fff", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <ShieldAlert size={14} /> Scope Violation
        </button>
        <button onClick={handleRevoke}
          disabled={!resolvedEventbotAddress}
          style={{ padding: "10px", borderRadius: "8px", border: "none", background: resolvedEventbotAddress ? "#ef4444" : "#7f1d1d", color: "#fff", fontWeight: 600, fontSize: "0.78rem", cursor: resolvedEventbotAddress ? "pointer" : "not-allowed", opacity: resolvedEventbotAddress ? 1 : 0.6, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <ShieldOff size={14} /> Revoke EventBot
        </button>
      </div>

      {actionStatus && (
        <div style={{ fontSize: "0.72rem", color: "#94a3b8", padding: "6px 8px", background: "#0f172a", borderRadius: "6px" }}>
          {actionStatus}
        </div>
      )}

      {/* Transaction Feed */}
      <h4 style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>Transactions</h4>
      <TransactionFeed transactions={transactions} />
    </div>
  );
}
