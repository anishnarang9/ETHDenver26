"use client";

import { useState, useEffect, useRef } from "react";
import { JsonRpcProvider, Contract } from "ethers";

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
  assetAddress?: string,
): WalletBalanceResult {
  const [balance, setBalance] = useState<string>("0.00");
  const [prevBalance, setPrevBalance] = useState<string>("0.00");
  const [direction, setDirection] = useState<BalanceDirection>("none");
  const [isPolling, setIsPolling] = useState(false);
  const prevRef = useRef<string>("0.00");

  useEffect(() => {
    if (!address || !assetAddress) return;

    const provider = new JsonRpcProvider(rpcUrl || "https://rpc-testnet.gokite.ai/");
    const token = new Contract(assetAddress, ERC20_ABI, provider);

    const poll = async () => {
      setIsPolling(true);
      try {
        const raw = await token.balanceOf(address);
        const formatted = (Number(raw) / 1e18).toFixed(2);

        const prev = prevRef.current;
        const prevNum = parseFloat(prev);
        const currNum = parseFloat(formatted);

        if (currNum > prevNum) {
          setDirection("up");
        } else if (currNum < prevNum) {
          setDirection("down");
        } else {
          setDirection("none");
        }

        setPrevBalance(prev);
        prevRef.current = formatted;
        setBalance(formatted);
      } catch {
        /* ignore */
      }
      // Brief delay to show polling indicator
      setTimeout(() => setIsPolling(false), 600);
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [address, rpcUrl, assetAddress]);

  return { balance, prevBalance, direction, isPolling };
}
