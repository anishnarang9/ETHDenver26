"use client";

import { useWalletBalance } from "../hooks/use-wallet-balance";

const rpcUrl = process.env.NEXT_PUBLIC_KITE_RPC_URL || "https://rpc-testnet.gokite.ai/";
const asset = process.env.NEXT_PUBLIC_PAYMENT_ASSET || "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
const explorerBase = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL || "https://testnet.kitescan.ai";

interface WalletItem {
  name: string;
  address: string;
  color: string;
}

export function WalletBalances({ wallets }: { wallets: WalletItem[] }) {
  return (
    <div className="panel">
      <h3 className="panel-title">Agent Wallets</h3>
      <div className="feed-list" style={{ marginTop: 10 }}>
        {wallets.map((wallet, index) => (
          <WalletRow key={`${wallet.name}-${wallet.address}-${index}`} wallet={wallet} />
        ))}
      </div>
    </div>
  );
}

function WalletRow({ wallet }: { wallet: WalletItem }) {
  const { balance, direction, isPolling } = useWalletBalance(wallet.address, rpcUrl, asset);
  return (
    <div className="feed-item" style={{ borderLeft: `3px solid ${wallet.color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong>{wallet.name}</strong>
        <span className={`badge ${direction === "up" ? "ok" : direction === "down" ? "danger" : "warn"}`}>
          {isPolling ? "polling" : direction}
        </span>
      </div>
      <div className="mono" style={{ marginTop: 4, fontSize: 12 }}>{balance} KITE</div>
      <div style={{ marginTop: 4 }}>
        <a
          href={`${explorerBase}/address/${wallet.address}`}
          target="_blank"
          rel="noreferrer"
          className="mono"
          style={{ fontSize: 11, color: "var(--accent-cyan)" }}
        >
          {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
        </a>
      </div>
    </div>
  );
}
