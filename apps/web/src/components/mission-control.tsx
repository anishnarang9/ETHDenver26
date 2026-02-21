"use client";

import { useState } from "react";
import { revokePassportOnchain } from "../lib/onchain";
import { TransactionFeed } from "./transaction-feed";
import { useSSEState } from "../lib/sse-context";
import type { TransactionEvent } from "../lib/types";

const DEMO_EMAIL = {
  from: "vagarwa4@terpmail.umd.edu",
  subject: "ETHDenver Trip Planning - 6 UMD Students (Feb 18-21)",
  body: `Hi TripDesk! We are a group of 6 college students from UMD heading to ETHDenver 2025.

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
Name: Rachit, email: vagarwa4@terpmail.umd.edu`,
};

export function MissionControl({
  transactions,
  plannerUrl,
}: {
  transactions: TransactionEvent[];
  plannerUrl: string;
}) {
  const { state, dispatch } = useSSEState();
  const [status, setStatus] = useState("Idle");
  const [sending, setSending] = useState(false);

  const isRunning =
    !!state.orchestratorPhase &&
    state.orchestratorPhase !== "completed" &&
    state.orchestratorPhase !== "killed";

  const revokeAddress =
    process.env.NEXT_PUBLIC_PLANNER_ADDRESS ||
    process.env.NEXT_PUBLIC_EVENTBOT_ADDRESS ||
    "";

  const sendDemoEmail = async () => {
    dispatch({ type: "RESET" });
    setSending(true);
    setStatus("Sending email to orchestrator...");
    try {
      const res = await fetch(`${plannerUrl}/api/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan-trip",
          from: DEMO_EMAIL.from,
          subject: DEMO_EMAIL.subject,
          body: DEMO_EMAIL.body,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { runId?: string };
      setStatus(`Email sent → run ${data.runId?.slice(0, 8) || "n/a"}`);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const trigger = async (action: string) => {
    dispatch({ type: "RESET" });
    setStatus(`Triggering ${action}...`);
    try {
      const res = await fetch(`${plannerUrl}/api/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { runId?: string };
      setStatus(`${action} started (run ${data.runId?.slice(0, 8) || "n/a"})`);
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    }
  };

  const kill = async () => {
    setStatus("Sending kill signal...");
    try {
      const res = await fetch(`${plannerUrl}/api/kill`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setStatus("All agents killed.");
    } catch (err) {
      setStatus(`Kill failed: ${(err as Error).message}`);
    }
  };

  const revoke = async () => {
    if (!revokeAddress) {
      setStatus("No revoke address configured");
      return;
    }
    setStatus("Submitting revoke transaction...");
    try {
      const tx = await revokePassportOnchain({ agentAddress: revokeAddress });
      setStatus(`Revoked ${revokeAddress.slice(0, 10)} via ${tx.txHash.slice(0, 10)}...`);
    } catch (err) {
      setStatus(`Revoke failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="panel">
      <h3 className="panel-title">Mission Control</h3>

      {/* ── Pre-typed email preview ── */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>
          <strong>From:</strong> {DEMO_EMAIL.from}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 6 }}>
          <strong>Subject:</strong> {DEMO_EMAIL.subject}
        </div>
        <pre style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 11,
          lineHeight: 1.5,
          color: "var(--text-1)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 200,
          overflowY: "auto",
          margin: 0,
        }}>
          {DEMO_EMAIL.body}
        </pre>
      </div>

      {/* ── Actions ── */}
      <div className="inline-actions" style={{ marginTop: 10 }}>
        <button
          className="primary-button"
          onClick={() => void sendDemoEmail()}
          disabled={sending}
        >
          {sending ? "Sending..." : "Send Email"}
        </button>
        <button className="secondary-button" onClick={() => void trigger("additional-search")}>
          Additional Search
        </button>
        <button className="secondary-button" onClick={() => void trigger("scope-violation")}>
          Scope Violation
        </button>
      </div>

      <div className="inline-actions" style={{ marginTop: 6 }}>
        <button className="danger-button" onClick={() => void revoke()}>
          Revoke Passport
        </button>
        <button className="danger-button" onClick={() => void kill()} disabled={!isRunning}>
          Kill Agents
        </button>
      </div>

      {/* ── Status ── */}
      <div className="event-item" style={{ marginTop: 10 }}>
        <strong>Status</strong>
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-2)" }}>{status}</div>
      </div>

      {/* ── Transactions ── */}
      <div style={{ marginTop: 10 }}>
        <h4 style={{ margin: 0, fontSize: 13, color: "var(--text-1)" }}>Transactions</h4>
        <div style={{ marginTop: 8 }}>
          <TransactionFeed transactions={transactions} />
        </div>
      </div>
    </div>
  );
}
