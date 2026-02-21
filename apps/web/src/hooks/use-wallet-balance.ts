"use client";

import { useEffect, useRef, useState } from "react";
import { Contract, JsonRpcProvider } from "ethers";

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

export type BalanceDirection = "up" | "down" | "none";

export interface WalletBalanceResult {
  balance: string;
  prevBalance: string;
  direction: BalanceDirection;
  isPolling: boolean;
}

export function useWalletBalance(
  address: string | undefined,
  rpcUrl?: string,
  assetAddress?: string
): WalletBalanceResult {
  const [balance, setBalance] = useState("0.00");
  const [prevBalance, setPrevBalance] = useState("0.00");
  const [direction, setDirection] = useState<BalanceDirection>("none");
  const [isPolling, setIsPolling] = useState(false);
  const prevRef = useRef("0.00");

  useEffect(() => {
    if (!address || !assetAddress) {
      return;
    }

    const provider = new JsonRpcProvider(rpcUrl || "https://rpc-testnet.gokite.ai/");
    const token = new Contract(assetAddress, ERC20_ABI, provider);

    const poll = async () => {
      setIsPolling(true);
      try {
        let nativeVal = 0;
        let erc20Val = 0;

        try {
          const native = await provider.getBalance(address);
          nativeVal = Number(native) / 1e18;
        } catch {
          nativeVal = 0;
        }

        try {
          const tokenBal = await token.balanceOf(address);
          erc20Val = Number(tokenBal) / 1e18;
        } catch {
          erc20Val = 0;
        }

        const current = Math.max(nativeVal, erc20Val).toFixed(2);
        const previous = prevRef.current;
        const currentNum = Number(current);
        const previousNum = Number(previous);

        if (currentNum > previousNum) {
          setDirection("up");
        } else if (currentNum < previousNum) {
          setDirection("down");
        } else {
          setDirection("none");
        }

        setPrevBalance(previous);
        prevRef.current = current;
        setBalance(current);
      } finally {
        setTimeout(() => setIsPolling(false), 450);
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 5000);

    return () => clearInterval(interval);
  }, [address, rpcUrl, assetAddress]);

  return { balance, prevBalance, direction, isPolling };
}
