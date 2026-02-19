"use client";

import { useState } from "react";
import { BrowserProvider, type Eip1193Provider } from "ethers";

export function WalletConnector(props: {
  onConnected: (address: string) => void;
}) {
  const [status, setStatus] = useState("Wallet not connected");

  const connect = async () => {
    if (!(window as unknown as { ethereum?: unknown }).ethereum) {
      setStatus("No EVM wallet detected");
      return;
    }

    try {
      const provider = new BrowserProvider(
        (window as unknown as { ethereum: Eip1193Provider }).ethereum
      );
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      props.onConnected(address);
      setStatus(`Connected: ${address}`);
    } catch (error) {
      setStatus(`Connection failed: ${(error as Error).message}`);
    }
  };

  return (
    <div className="panel">
      <h2>Owner Wallet</h2>
      <button onClick={connect}>Connect Wallet</button>
      <div className="status">{status}</div>
      <div className="status">
        The dashboard can call gateway relayer endpoints for demo speed. For production, sign tx directly from wallet.
      </div>
    </div>
  );
}
