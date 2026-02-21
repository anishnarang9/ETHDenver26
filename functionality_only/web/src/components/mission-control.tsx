"use client";

import { useState } from "react";
import { TransactionFeed } from "./transaction-feed";
import { revokePassportOnchain } from "../lib/onchain";
import { RefreshCw, ShieldAlert, ShieldOff, Plane, Pause, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  agentAddress?: string;
  plannerAddress?: string;
  riderAddress?: string;
  foodieAddress?: string;
  eventbotAddress?: string;
}

export function MissionControl({
  transactions,
  plannerUrl,
  agentAddress,
  plannerAddress,
  riderAddress,
  foodieAddress,
  eventbotAddress,
}: MissionControlProps) {
  const [actionStatus, setActionStatus] = useState<string>("");
  const [isPaused, setIsPaused] = useState(false);

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

  const resolvedRevokeAddress =
    agentAddress ||
    eventbotAddress ||
    process.env.NEXT_PUBLIC_EVENTBOT_ADDRESS ||
    "";

  const handleRevoke = async () => {
    if (!resolvedRevokeAddress) {
      setActionStatus("Revoke error: no agent address configured");
      return;
    }
    setActionStatus("Revoking EventBot passport...");
    try {
      const result = await revokePassportOnchain({
        agentAddress: resolvedRevokeAddress,
      });
      setActionStatus(`EventBot revoked! Tx: ${result.txHash.slice(0, 12)}...`);
      setTimeout(() => triggerAction("post-revoke-test"), 2000);
    } catch (err) {
      setActionStatus(`Revoke error: ${(err as Error).message}`);
    }
  };

  const handlePause = async () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    setActionStatus(nextPaused ? "Pausing all agents..." : "Resuming all agents...");
    try {
      const res = await fetch(`${plannerUrl}/api/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextPaused ? "pause-all" : "resume-all" }),
      });
      const data = await res.json();
      setActionStatus(
        nextPaused
          ? `Paused (run: ${data.runId?.slice(0, 8)})`
          : `Resumed (run: ${data.runId?.slice(0, 8)})`
      );
    } catch (err) {
      setIsPaused(!nextPaused);
      setActionStatus(`Error: ${(err as Error).message}`);
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
        <div style={{ position: "relative" }}>
          <button onClick={handleRevoke}
            disabled={!resolvedRevokeAddress}
            title={resolvedRevokeAddress ? `Revoke passport for ${resolvedRevokeAddress.slice(0, 6)}...${resolvedRevokeAddress.slice(-4)}` : "No agent address configured -- set agentAddress prop or NEXT_PUBLIC_EVENTBOT_ADDRESS env var"}
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "none", background: resolvedRevokeAddress ? "#ef4444" : "#7f1d1d", color: "#fff", fontWeight: 600, fontSize: "0.78rem", cursor: resolvedRevokeAddress ? "pointer" : "not-allowed", opacity: resolvedRevokeAddress ? 1 : 0.6, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <ShieldOff size={14} /> Revoke EventBot
          </button>
          {!resolvedRevokeAddress && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px", fontSize: "0.62rem", color: "#f59e0b" }}>
              <AlertTriangle size={10} /> No agent address configured
            </div>
          )}
        </div>
        <button onClick={handlePause}
          style={{ padding: "10px", borderRadius: "8px", border: "none", background: isPaused ? "#16a34a" : "#64748b", color: "#fff", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", gridColumn: "1 / -1" }}>
          <Pause size={14} /> {isPaused ? "Resume Agents" : "Pause Agents"}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {actionStatus && (
          <motion.div
            key={actionStatus}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            style={{ fontSize: "0.72rem", color: "#94a3b8", padding: "6px 8px", background: "#0f172a", borderRadius: "6px" }}
          >
            {actionStatus}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction Feed */}
      <h4 style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>Transactions</h4>
      <TransactionFeed transactions={transactions} />
    </div>
  );
}
