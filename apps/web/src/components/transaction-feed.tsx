"use client";

import type { TransactionEvent } from "../lib/types";

const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL || "https://testnet.kitescan.ai";

export function TransactionFeed({ transactions }: { transactions: TransactionEvent[] }) {
  if (transactions.length === 0) {
    return <div className="event-item">No payment activity yet.</div>;
  }

  return (
    <div className="feed-list">
      {transactions.slice().reverse().map((tx) => (
        <div key={tx.id} className="feed-item">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{tx.from} to {tx.to}</strong>
            <span className={`badge ${tx.status === "complete" ? "ok" : tx.status === "failed" ? "danger" : "warn"}`}>
              {tx.status}
            </span>
          </div>
          <div className="mono" style={{ marginTop: 4, fontSize: 11, color: "var(--text-2)" }}>
            amount={tx.amount || "0"} method={tx.method}
          </div>
          {tx.txHash && (
            <a
              href={`${explorerBase}/tx/${tx.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="mono"
              style={{ marginTop: 4, display: "inline-block", fontSize: 11, color: "var(--accent-cyan)" }}
            >
              view on explorer
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
