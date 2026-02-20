"use client";

import { useWalletBalance } from "../hooks/use-wallet-balance";

const rpcUrl = process.env.NEXT_PUBLIC_KITE_RPC_URL || "https://rpc-testnet.gokite.ai/";
const asset = process.env.NEXT_PUBLIC_PAYMENT_ASSET || "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";

interface AgentWallet {
  name: string;
  address: string;
  color: string;
}

export function WalletBalances({ wallets }: { wallets: AgentWallet[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
      {wallets.map((w) => (
        <WalletCard key={w.name} wallet={w} />
      ))}
    </div>
  );
}

function WalletCard({ wallet }: { wallet: AgentWallet }) {
  const balance = useWalletBalance(wallet.address, rpcUrl, asset);

  return (
    <div style={{
      padding: "10px 12px", background: "#0f172a", borderRadius: "8px",
      borderLeft: `3px solid ${wallet.color}`,
    }}>
      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{wallet.name}</div>
      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#e2e8f0" }}>{balance}</div>
      <div style={{ fontSize: "0.6rem", color: "#475569", fontFamily: "monospace" }}>
        {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
      </div>
    </div>
  );
}
