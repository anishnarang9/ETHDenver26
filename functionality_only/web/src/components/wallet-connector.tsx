"use client";

import { useState } from "react";
import { BrowserProvider, type Eip1193Provider } from "ethers";

export function WalletConnector(props: {
  onConnected: (address: string) => void;
}) {
  const [status, setStatus] = useState("Wallet not connected");

  const connect = async () => {
    const win = window as unknown as {
      ethereum?: Eip1193Provider & { providers?: (Eip1193Provider & { isMetaMask?: boolean })[] ; isMetaMask?: boolean };
    };

    if (!win.ethereum) {
      setStatus("No EVM wallet detected");
      return;
    }

    // Prefer MetaMask when multiple wallet extensions are installed
    const eth = win.ethereum.providers?.find((p) => p.isMetaMask) ?? win.ethereum;

    try {
      const provider = new BrowserProvider(eth);
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
        Passport and session transactions are signed in-wallet. The gateway never receives owner private keys.
      </div>
    </div>
  );
}
