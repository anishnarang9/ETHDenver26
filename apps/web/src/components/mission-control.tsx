"use client";

import { useState, useEffect } from "react";
import { useSSEState } from "../lib/sse-context";
import { TransactionFeed } from "./transaction-feed";
import { revokePassportOnchain } from "../lib/onchain";
import {
  RefreshCw,
  ShieldAlert,
  ShieldOff,
  Mail,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Inbox,
  Send,
  Edit3,
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
  incomingEmail?: { from: string; subject: string; body: string };
}

const DEFAULT_FROM = "vagarwa4@terpmail.umd.edu";
const DEFAULT_SUBJECT = "ETHDenver Trip Planning - 6 UMD Students (Feb 18-21)";
const DEFAULT_BODY = `Hi TripDesk! We are a group of 6 college students from UMD heading to ETHDenver 2025.

Travel Details:
- Group size: 6 students
- Outbound: Wed Feb 18, arriving DEN ~11 AM
- Return: Sat Feb 21, 4:30 PM from DEN
- Accommodation: Airbnb at 2592 Meadowbrook Dr, Denver CO
- ETHDenver venue: 4850 Western Dr

What We Need:
1. Airport rides (arrival + departure) for 6 people
2. Daily transport: Airbnb to ETHDenver venue and back
3. Side events: AI and blockchain events during ETHDenver week
4. Restaurants: Budget-friendly Chinese and Mexican near venue, $10-15 per person

Budget: Tight college student budget
Priority: ETHDenver main event > AI/crypto side events > cheap food

Please build a day-by-day itinerary Wed-Sat.
Name: Rachit, email: vagarwa4@terpmail.umd.edu`;

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0a0f1a",
  border: "1px solid #1e293b",
  borderRadius: 6,
  padding: "6px 8px",
  color: "#e2e8f0",
  fontSize: "0.7rem",
  fontFamily: "inherit",
  outline: "none",
  resize: "none" as const,
};

export function MissionControl({
  transactions,
  plannerUrl,
  agentAddress,
  eventbotAddress,
  incomingEmail,
}: MissionControlProps) {
  const { dispatch } = useSSEState();
  const [actionStatus, setActionStatus] = useState<string>("");
  const [plannerEmail, setPlannerEmail] = useState<string>("tripdesk-planner@agentmail.to");
  const [showDemoButtons, setShowDemoButtons] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCompose, setShowCompose] = useState(false);

  // Compose form state — starts empty so user types their own request
  const [emailFrom, setEmailFrom] = useState(DEFAULT_FROM);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${plannerUrl}/api/mail-addresses`);
        const data = await res.json() as { configured?: boolean; planner?: string };
        if (data.configured && data.planner) setPlannerEmail(data.planner);
      } catch { /* keep default */ }
    })();
  }, [plannerUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(plannerEmail).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendEmail = async () => {
    if (!emailFrom || !emailSubject || !emailBody) {
      setActionStatus("Please fill in all fields");
      return;
    }
    dispatch({ type: "RESET" });
    setSending(true);
    setActionStatus("Sending real email to orchestrator...");
    try {
      const res = await fetch(`${plannerUrl}/api/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: emailFrom,
          subject: emailSubject,
          body: emailBody,
        }),
      });
      const data = await res.json() as { ok?: boolean; method?: string; error?: string; proxy?: string };
      if (data.ok) {
        const method = data.method === "smtp" ? "SMTP" : "AgentMail relay";
        setActionStatus(`Email sent via ${method} — waiting for planner to pick it up...`);
        setShowCompose(false);
      } else {
        setActionStatus(`Send failed: ${data.error}`);
      }
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
      const data = await res.json() as { runId?: string };
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
      const result = await revokePassportOnchain({ agentAddress: resolvedRevokeAddress });
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
      {/* ── Inbox address card ── */}
      <div
        style={{
          background: "#0f172a",
          borderRadius: 10,
          border: "1px solid #1e293b",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 10px",
            borderBottom: "1px solid #1e293b",
          }}
        >
          <Inbox size={11} style={{ color: "#818cf8", flexShrink: 0 }} />
          <span style={{ fontSize: "0.68rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Compose & send to TripDesk
          </span>
        </div>

        {/* Planner email address + copy button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 10px",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: "0.6rem", color: "#475569" }}>To:</span>
            <span
              style={{
                color: "#818cf8",
                fontFamily: "monospace",
                fontSize: "0.72rem",
                fontWeight: 600,
                wordBreak: "break-all",
              }}
            >
              {plannerEmail}
            </span>
          </div>
          <motion.button
            onClick={handleCopy}
            whileTap={{ scale: 0.9 }}
            title="Copy address"
            style={{
              flexShrink: 0,
              background: "transparent",
              border: "1px solid #1e293b",
              borderRadius: 6,
              padding: "4px 6px",
              cursor: "pointer",
              color: copied ? "#22c55e" : "#475569",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: "0.62rem",
              fontFamily: "inherit",
              transition: "color 0.2s",
            }}
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? "Copied" : "Copy"}
          </motion.button>
        </div>

        {/* Compose form (collapsible) */}
        <div style={{ borderTop: "1px solid #1e293b" }}>
          <button
            onClick={() => setShowCompose(!showCompose)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 10px",
              background: "none",
              border: "none",
              color: showCompose ? "#818cf8" : "#64748b",
              fontSize: "0.65rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.03em",
            }}
          >
            <Edit3 size={10} />
            {showCompose ? "Hide compose" : "Compose email"}
            {showCompose ? <ChevronUp size={10} style={{ marginLeft: "auto" }} /> : <ChevronDown size={10} style={{ marginLeft: "auto" }} />}
          </button>

          <AnimatePresence>
            {showCompose && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* From field */}
                  <div>
                    <label style={{ fontSize: "0.6rem", color: "#475569", display: "block", marginBottom: 2 }}>From</label>
                    <input
                      type="email"
                      value={emailFrom}
                      onChange={(e) => setEmailFrom(e.target.value)}
                      placeholder="your@email.com"
                      style={inputStyle}
                    />
                  </div>
                  {/* Subject field */}
                  <div>
                    <label style={{ fontSize: "0.6rem", color: "#475569", display: "block", marginBottom: 2 }}>Subject</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Trip planning request"
                      style={inputStyle}
                    />
                  </div>
                  {/* Body field */}
                  <div>
                    <label style={{ fontSize: "0.6rem", color: "#475569", display: "block", marginBottom: 2 }}>Body</label>
                    <textarea
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      rows={6}
                      placeholder="Describe your trip planning needs..."
                      style={{ ...inputStyle, lineHeight: 1.4 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Send email button */}
        <div style={{ borderTop: "1px solid #1e293b", padding: "8px 10px" }}>
          <motion.button
            onClick={sendEmail}
            disabled={sending}
            whileTap={{ scale: 0.96 }}
            style={{
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "7px 10px",
              borderRadius: 8,
              border: "1px solid rgba(129,140,248,0.35)",
              background: sending
                ? "rgba(129,140,248,0.05)"
                : "linear-gradient(135deg, rgba(56,189,248,0.12), rgba(129,140,248,0.12))",
              color: sending ? "#475569" : "#818cf8",
              fontWeight: 600,
              fontSize: "0.7rem",
              cursor: sending ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              letterSpacing: "0.03em",
              transition: "background 0.2s, color 0.2s",
            }}
          >
            <Send size={11} style={{ flexShrink: 0 }} />
            {sending ? "Sending..." : "Send Email"}
          </motion.button>
          <div style={{ marginTop: 4, fontSize: "0.58rem", color: "#334155", textAlign: "center" }}>
            {emailFrom} &rarr; {plannerEmail}
          </div>
        </div>

        {/* Listening indicator / received email */}
        <div style={{ borderTop: "1px solid #1e293b", padding: "8px 10px" }}>
          <AnimatePresence mode="wait">
            {incomingEmail ? (
              <motion.div
                key="received"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                style={{ display: "flex", flexDirection: "column", gap: 4 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span
                    style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: "#22c55e",
                      boxShadow: "0 0 6px rgba(34,197,94,0.6)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: "0.65rem", color: "#22c55e", fontWeight: 600 }}>
                    Email received — agents running
                  </span>
                </div>
                <div
                  style={{
                    background: "#0a0f1a",
                    borderRadius: 6,
                    padding: "6px 8px",
                    border: "1px solid #1e293b",
                  }}
                >
                  <div style={{ fontSize: "0.62rem", color: "#64748b", marginBottom: 2 }}>
                    From: <span style={{ color: "#94a3b8" }}>{incomingEmail.from}</span>
                  </div>
                  <div style={{ fontSize: "0.62rem", color: "#64748b", marginBottom: 4 }}>
                    Subject: <span style={{ color: "#94a3b8" }}>{incomingEmail.subject}</span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.65rem",
                      color: "#64748b",
                      lineHeight: 1.4,
                      maxHeight: 52,
                      overflow: "hidden",
                      maskImage: "linear-gradient(to bottom, #000 60%, transparent 100%)",
                    }}
                  >
                    {incomingEmail.body}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ display: "flex", alignItems: "center", gap: 7 }}
              >
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: "#3b82f6",
                    boxShadow: "0 0 8px rgba(59,130,246,0.5)",
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                <span style={{ fontSize: "0.68rem", color: "#475569" }}>
                  Listening for emails...
                </span>
                <Mail size={11} style={{ color: "#334155", marginLeft: "auto" }} />
              </motion.div>
            )}
          </AnimatePresence>
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
                  padding: "7px 8px", borderRadius: "6px",
                  border: "1px solid #334155", background: "transparent",
                  color: "#94a3b8", fontWeight: 500, fontSize: "0.68rem",
                  cursor: "pointer", display: "inline-flex", alignItems: "center",
                  justifyContent: "center", gap: "4px", fontFamily: "inherit",
                }}
              >
                <RefreshCw size={11} /> Search
              </button>
              <button
                onClick={() => triggerAction("scope-violation")}
                style={{
                  padding: "7px 8px", borderRadius: "6px",
                  border: "1px solid #f59e0b30", background: "transparent",
                  color: "#f59e0b", fontWeight: 500, fontSize: "0.68rem",
                  cursor: "pointer", display: "inline-flex", alignItems: "center",
                  justifyContent: "center", gap: "4px", fontFamily: "inherit",
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
                  gridColumn: "1 / -1", padding: "7px 8px", borderRadius: "6px",
                  border: "1px solid #ef444440", background: "transparent",
                  color: resolvedRevokeAddress ? "#ef4444" : "#7f1d1d",
                  fontWeight: 500, fontSize: "0.68rem",
                  cursor: resolvedRevokeAddress ? "pointer" : "not-allowed",
                  opacity: resolvedRevokeAddress ? 1 : 0.5,
                  display: "inline-flex", alignItems: "center",
                  justifyContent: "center", gap: "4px", fontFamily: "inherit",
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
              fontSize: "0.72rem", color: "#94a3b8",
              padding: "6px 8px", background: "#0f172a", borderRadius: "6px",
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
