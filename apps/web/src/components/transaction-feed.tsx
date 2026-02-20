"use client";

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

const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL || "https://testnet.kitescan.ai";

export function TransactionFeed({ transactions }: { transactions: Transaction[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: 200, overflow: "auto" }}>
      {transactions.length === 0 ? (
        <p style={{ color: "#334155", fontSize: "0.8rem" }}>No transactions yet</p>
      ) : (
        transactions.map((tx, idx) => (
          <div key={tx.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 10px", background: "#0f172a", borderRadius: "8px",
            borderLeft: `3px solid ${tx.status === "complete" ? "#22c55e" : tx.status === "failed" ? "#ef4444" : "#eab308"}`,
          }}>
            <div>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#e2e8f0" }}>
                #{idx + 1} {tx.from} → {tx.to}
              </div>
              <div style={{ fontSize: "0.68rem", color: "#64748b" }}>
                {tx.amount ? `${(Number(tx.amount) / 1e18).toFixed(2)} tokens` : ""} | {tx.method}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              {tx.txHash ? (
                <a href={`${explorerBase}/tx/${tx.txHash}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.68rem", color: "#38bdf8", textDecoration: "none" }}>
                  Kitescan
                </a>
              ) : (
                <span style={{ fontSize: "0.68rem", color: tx.status === "failed" ? "#ef4444" : "#eab308" }}>
                  {tx.status}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
