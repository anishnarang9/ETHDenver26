"use client";

import { useState, useEffect } from "react";
import { TransactionFeed } from "./transaction-feed";
import { revokePassportOnchain } from "../lib/onchain";
import {
  Send,
  RefreshCw,
  ShieldAlert,
  ShieldOff,
  AlertTriangle,
  Mail,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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

const DEFAULT_EMAIL_BODY = `Hi TripDesk! We're a group of 6 college students from the University of Maryland heading to ETHDenver.

We're flying into Denver on Wed Feb 18 at 11 AM. Need a ride from DEN airport to 2592 Meadowbrook Dr. Attending ETHDenver + AI side events. Want budget Chinese & Mexican restaurants for dinner. Keep it cheap!

Plan our Wed-Sun itinerary please.`;

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
  const [plannerEmail, setPlannerEmail] = useState<string>("");
  const [emailBody, setEmailBody] = useState(DEFAULT_EMAIL_BODY);
  const [sending, setSending] = useState(false);
  const [showDemoButtons, setShowDemoButtons] = useState(false);

  // Fetch the orchestrator's email address on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${plannerUrl}/api/mail-addresses`);
        const data = await res.json() as { configured?: boolean; planner?: string };
        if (data.configured && data.planner) {
          setPlannerEmail(data.planner);
        }
      } catch {
        // Fall back — the trigger endpoint still works
      }
    })();
  }, [plannerUrl]);

  // Send email to the orchestrator (via the webhook trigger path)
  const handleSendEmail = async () => {
    if (!emailBody.trim()) return;
    setSending(true);
    setActionStatus("Sending email to orchestrator...");
    try {
      const res = await fetch(`${plannerUrl}/api/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan-trip",
          body: emailBody.trim(),
          subject: "Trip Planning Request",
        }),
      });
      const data = await res.json();
      setActionStatus(`Email sent! Agents starting... (run: ${data.runId?.slice(0, 8)})`);
    } catch (err) {
      setActionStatus(`Error: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

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

  return (
    <div
      style={{
        background: "#111827",
        borderRadius: "12px",
        border: "1px solid #1e293b",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <h3 style={{ margin: 0, fontSize: "0.9rem", color: "#94a3b8" }}>Mission Control</h3>

      {/* ── Email Compose ── */}
      <div
        style={{
          background: "#0f172a",
          borderRadius: 10,
          border: "1px solid #1e293b",
          overflow: "hidden",
        }}
      >
        {/* To field */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid #1e293b",
            fontSize: "0.72rem",
          }}
        >
          <Mail size={12} style={{ color: "#818cf8", flexShrink: 0 }} />
          <span style={{ color: "#64748b" }}>To:</span>
          <span style={{ color: "#818cf8", fontFamily: "monospace", fontSize: "0.68rem" }}>
            {plannerEmail || "tripdesk-planner@agentmail.to"}
          </span>
        </div>

        {/* Body */}
        <textarea
          value={emailBody}
          onChange={(e) => setEmailBody(e.target.value)}
          placeholder="Describe your trip..."
          style={{
            width: "100%",
            minHeight: 100,
            padding: "10px 12px",
            background: "transparent",
            border: "none",
            color: "#e2e8f0",
            fontSize: "0.78rem",
            fontFamily: "inherit",
            lineHeight: 1.5,
            resize: "vertical",
            outline: "none",
          }}
        />

        {/* Send button */}
        <div style={{ padding: "0 12px 10px" }}>
          <motion.button
            onClick={handleSendEmail}
            disabled={sending || !emailBody.trim()}
            whileHover={sending ? {} : { scale: 1.015 }}
            whileTap={sending ? {} : { scale: 0.985 }}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 8,
              border: "none",
              background: sending
                ? "#1e293b"
                : "linear-gradient(135deg, #3b82f6, #818cf8)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: sending ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontFamily: "inherit",
              boxShadow: sending
                ? "none"
                : "0 4px 14px rgba(59,130,246,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            <Send size={14} />
            {sending ? "Sending..." : "Send to Orchestrator"}
          </motion.button>
        </div>
      </div>

      {/* ── Demo Actions (collapsible) ── */}
      <button
        onClick={() => setShowDemoButtons(!showDemoButtons)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: "none",
          color: "#475569",
          fontSize: "0.68rem",
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {showDemoButtons ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Demo Actions
      </button>

      <AnimatePresence>
        {showDemoButtons && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button
                onClick={() => triggerAction("additional-search")}
                style={{
                  padding: "10px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#8b5cf6",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  fontFamily: "inherit",
                }}
              >
                <RefreshCw size={14} /> Additional Search
              </button>
              <button
                onClick={() => triggerAction("scope-violation")}
                style={{
                  padding: "10px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#f59e0b",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  fontFamily: "inherit",
                }}
              >
                <ShieldAlert size={14} /> Scope Violation
              </button>
              <div style={{ position: "relative", gridColumn: "1 / -1" }}>
                <button
                  onClick={handleRevoke}
                  disabled={!resolvedRevokeAddress}
                  title={
                    resolvedRevokeAddress
                      ? `Revoke passport for ${resolvedRevokeAddress.slice(0, 6)}...${resolvedRevokeAddress.slice(-4)}`
                      : "No agent address configured"
                  }
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "none",
                    background: resolvedRevokeAddress ? "#ef4444" : "#7f1d1d",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "0.78rem",
                    cursor: resolvedRevokeAddress ? "pointer" : "not-allowed",
                    opacity: resolvedRevokeAddress ? 1 : 0.6,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    fontFamily: "inherit",
                  }}
                >
                  <ShieldOff size={14} /> Revoke EventBot
                </button>
                {!resolvedRevokeAddress && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      marginTop: "4px",
                      fontSize: "0.62rem",
                      color: "#f59e0b",
                    }}
                  >
                    <AlertTriangle size={10} /> No agent address configured
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status */}
      <AnimatePresence mode="wait">
        {actionStatus && (
          <motion.div
            key={actionStatus}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            style={{
              fontSize: "0.72rem",
              color: "#94a3b8",
              padding: "6px 8px",
              background: "#0f172a",
              borderRadius: "6px",
            }}
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
