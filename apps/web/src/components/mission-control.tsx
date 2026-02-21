"use client";

import { useMemo, useState } from "react";
import { revokePassportOnchain } from "../lib/onchain";
import { TransactionFeed } from "./transaction-feed";
import { useSSEState } from "../lib/sse-context";
import type { TransactionEvent } from "../lib/types";

export function MissionControl({
  transactions,
  plannerUrl,
}: {
  transactions: TransactionEvent[];
  plannerUrl: string;
}) {
  const [status, setStatus] = useState<string>("Idle");
  const { state } = useSSEState();
  const isRunning =
    !!state.orchestratorPhase &&
    state.orchestratorPhase !== "completed" &&
    state.orchestratorPhase !== "killed";

  const revokeAddress =
    process.env.NEXT_PUBLIC_PLANNER_ADDRESS ||
    process.env.NEXT_PUBLIC_EVENTBOT_ADDRESS ||
    "";

  const controls = useMemo(
    () => [
      { key: "plan-trip", label: "Run Demo", className: "primary-button" },
      { key: "additional-search", label: "Additional Search", className: "secondary-button" },
      { key: "scope-violation", label: "Scope Violation", className: "secondary-button" },
      { key: "post-revoke-test", label: "Post Revoke Test", className: "secondary-button" },
    ],
    []
  );

  const trigger = async (action: string) => {
    setStatus(`Triggering ${action}...`);
    try {
      const response = await fetch(`${plannerUrl}/api/trigger`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { runId?: string };
      setStatus(`${action} started (run ${data.runId?.slice(0, 8) || "n/a"})`);
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    }
  };

  const kill = async () => {
    setStatus("Sending kill signal...");
    try {
      const response = await fetch(`${plannerUrl}/api/kill`, { method: "POST" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setStatus("All agents killed.");
    } catch (error) {
      setStatus(`Kill failed: ${(error as Error).message}`);
    }
  };

  const revoke = async () => {
    if (!revokeAddress) {
      setStatus("No revoke address configured in NEXT_PUBLIC_PLANNER_ADDRESS or NEXT_PUBLIC_EVENTBOT_ADDRESS");
      return;
    }

    setStatus("Submitting revoke transaction...");
    try {
      const tx = await revokePassportOnchain({ agentAddress: revokeAddress });
      setStatus(`Revoked ${revokeAddress.slice(0, 10)} via ${tx.txHash.slice(0, 10)}...`);
    } catch (error) {
      setStatus(`Revoke failed: ${(error as Error).message}`);
    }
  };

  return (
    <div className="panel">
      <h3 className="panel-title">Mission Control</h3>
      <div className="inline-actions" style={{ marginTop: 10 }}>
        {controls.map((control) => (
          <button
            key={control.key}
            className={control.className}
            onClick={() => {
              void trigger(control.key);
            }}
          >
            {control.label}
          </button>
        ))}
        <button className="danger-button" onClick={revoke}>
          Revoke Passport
        </button>
        <button className="danger-button" onClick={() => void kill()} disabled={!isRunning}>
          Kill Agents
        </button>
      </div>

      <div className="event-item" style={{ marginTop: 10 }}>
        <strong>Status</strong>
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-2)" }}>{status}</div>
      </div>

      <div style={{ marginTop: 10 }}>
        <h4 style={{ margin: 0, fontSize: 13, color: "var(--text-1)" }}>Transactions</h4>
        <div style={{ marginTop: 8 }}>
          <TransactionFeed transactions={transactions} />
        </div>
      </div>
    </div>
  );
}
