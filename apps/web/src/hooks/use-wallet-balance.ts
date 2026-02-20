"use client";

import { useState, useEffect } from "react";
import { JsonRpcProvider, Contract } from "ethers";

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

export function useWalletBalance(address: string | undefined, rpcUrl?: string, assetAddress?: string) {
  const [balance, setBalance] = useState<string>("0.00");

  useEffect(() => {
    if (!address || !assetAddress) return;

    const provider = new JsonRpcProvider(rpcUrl || "https://rpc-testnet.gokite.ai/");
    const token = new Contract(assetAddress, ERC20_ABI, provider);

    const poll = async () => {
      try {
        const raw = await token.balanceOf(address);
        const formatted = (Number(raw) / 1e18).toFixed(2);
        setBalance(formatted);
      } catch { /* ignore */ }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [address, rpcUrl, assetAddress]);

  return balance;
}
