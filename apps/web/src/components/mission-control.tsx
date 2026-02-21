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

const DEFAULT_EMAIL_SUBJECT = `ETHDenver Trip Planning — 6 Students from UMD (Feb 18–21)`;

const DEFAULT_EMAIL_BODY = `Hi TripDesk! We're a group of 6 college students from the University of Maryland heading to ETHDenver 2025 and need help planning the full trip.

## Travel Details
- **Group size:** 6 students (all early 20s, no mobility needs)
- **Outbound flight:** Wednesday Feb 18, arriving Denver International Airport (DEN) at ~11:00 AM local time
- **Return flight:** Saturday Feb 21, 4:30 PM from DEN. We need to leave the ETHDenver venue at 4850 Western Dr by ~2:00 PM to make our flight.
- **Accommodation:** Airbnb already booked at 2592 Meadowbrook Dr, Denver CO

## What We Need
1. **Airport ride (arrival):** Cheapest/fastest option from DEN → 2592 Meadowbrook Dr on Wednesday ~11 AM. We're 6 people so may need XL or two separate rides — compare Uber, Lyft, and shuttle options.
2. **Airport ride (departure):** Ride from the ETHDenver venue at 4850 Western Dr → DEN on Saturday Feb 21, leaving by ~2:00 PM to catch our 4:30 PM flight.
3. **Daily conference transport:** We're attending the main ETHDenver conference at 4850 Western Dr all week. Need transport from our Airbnb to the venue and back each day.
4. **Side events:** Find AI and blockchain side events during ETHDenver week (Feb 18–21). We especially want AI agent talks, hackathon workshops, and crypto/DeFi meetups. Check lu.ma, Eventbrite, and the ETHDenver side event schedule.
5. **Restaurants:** Budget-friendly Chinese and Mexican spots near the venue or our Airbnb. College student budget — $10–15 per person max. We'll eat out every dinner.
6. **Local transport:** For daily Denver travel, prioritize shortest travel time. Compare RTD light rail, bus, and rideshare.

## Budget & Priorities
- **Budget:** Tight — minimize costs wherever possible
- **Pace:** Relaxed. Conference during the day, food and chill at night.
- **Priority order:** ETHDenver main event → AI/crypto side events → good cheap food → exploring Denver

Please build us a day-by-day itinerary from Wed Feb 18 through Sat Feb 21 with transport options, restaurant picks, and event recommendations.`;

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
  const [emailSubject, setEmailSubject] = useState(DEFAULT_EMAIL_SUBJECT);
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
          subject: emailSubject.trim() || DEFAULT_EMAIL_SUBJECT,
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
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
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
            gap: 6,
            padding: "6px 10px",
            borderBottom: "1px solid #1e293b",
            fontSize: "0.68rem",
          }}
        >
          <Mail size={10} style={{ color: "#818cf8", flexShrink: 0 }} />
          <span style={{ color: "#64748b" }}>To:</span>
          <span style={{ color: "#818cf8", fontFamily: "monospace", fontSize: "0.62rem" }}>
            {plannerEmail || "tripdesk-planner@agentmail.to"}
          </span>
        </div>

        {/* Subject field */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderBottom: "1px solid #1e293b",
            fontSize: "0.68rem",
          }}
        >
          <span style={{ color: "#64748b", flexShrink: 0 }}>Subject:</span>
          <input
            type="text"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "#e2e8f0",
              fontSize: "0.68rem",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>

        {/* Body */}
        <textarea
          value={emailBody}
          onChange={(e) => setEmailBody(e.target.value)}
          placeholder="Describe your trip..."
          style={{
            width: "100%",
            minHeight: 72,
            maxHeight: 120,
            padding: "8px 10px",
            background: "transparent",
            border: "none",
            color: "#e2e8f0",
            fontSize: "0.72rem",
            fontFamily: "inherit",
            lineHeight: 1.4,
            resize: "vertical",
            outline: "none",
          }}
        />

        {/* Send button */}
        <div style={{ padding: "0 10px 8px" }}>
          <motion.button
            onClick={handleSendEmail}
            disabled={sending || !emailBody.trim()}
            whileHover={sending ? {} : { scale: 1.015 }}
            whileTap={sending ? {} : { scale: 0.985 }}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: 8,
              border: "none",
              background: sending
                ? "#1e293b"
                : "linear-gradient(135deg, #3b82f6, #818cf8)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.72rem",
              cursor: sending ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              fontFamily: "inherit",
              boxShadow: sending
                ? "none"
                : "0 2px 10px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <Send size={12} />
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              <button
                onClick={() => triggerAction("additional-search")}
                style={{
                  padding: "7px 8px",
                  borderRadius: "6px",
                  border: "1px solid #334155",
                  background: "transparent",
                  color: "#94a3b8",
                  fontWeight: 500,
                  fontSize: "0.68rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  fontFamily: "inherit",
                }}
              >
                <RefreshCw size={11} /> Search
              </button>
              <button
                onClick={() => triggerAction("scope-violation")}
                style={{
                  padding: "7px 8px",
                  borderRadius: "6px",
                  border: "1px solid #f59e0b30",
                  background: "transparent",
                  color: "#f59e0b",
                  fontWeight: 500,
                  fontSize: "0.68rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  fontFamily: "inherit",
                }}
              >
                <ShieldAlert size={11} /> Scope Test
              </button>
              <button
                onClick={handleRevoke}
                disabled={!resolvedRevokeAddress}
                title={
                  resolvedRevokeAddress
                    ? `Revoke passport for ${resolvedRevokeAddress.slice(0, 6)}...${resolvedRevokeAddress.slice(-4)}`
                    : "No agent address configured"
                }
                style={{
                  gridColumn: "1 / -1",
                  padding: "7px 8px",
                  borderRadius: "6px",
                  border: "1px solid #ef444440",
                  background: "transparent",
                  color: resolvedRevokeAddress ? "#ef4444" : "#7f1d1d",
                  fontWeight: 500,
                  fontSize: "0.68rem",
                  cursor: resolvedRevokeAddress ? "pointer" : "not-allowed",
                  opacity: resolvedRevokeAddress ? 1 : 0.5,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                  fontFamily: "inherit",
                }}
              >
                <ShieldOff size={11} /> Revoke Passport
              </button>
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
      {transactions.length > 0 && (
        <>
          <h4 style={{ margin: 0, fontSize: "0.68rem", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Transactions
          </h4>
          <TransactionFeed transactions={transactions} />
        </>
      )}
    </div>
  );
}
