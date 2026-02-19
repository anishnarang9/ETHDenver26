import { Contract, JsonRpcProvider, Wallet } from "ethers";
import type { PaymentChallenge } from "@kite-stack/shared-types";

const ERC20_ABI = ["function transfer(address to, uint256 value) returns (bool)"];

export interface FacilitatorPayResult {
  ok: boolean;
  paymentSignature?: string;
  txHash?: `0x${string}`;
  reason?: string;
}

export const payViaFacilitator = async (input: {
  facilitatorUrl: string;
  challenge: PaymentChallenge;
  payer: `0x${string}`;
}): Promise<FacilitatorPayResult> => {
  if (!input.facilitatorUrl) {
    return { ok: false, reason: "facilitator not configured" };
  }

  try {
    const response = await fetch(`${input.facilitatorUrl}/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionId: input.challenge.actionId,
        challenge: input.challenge,
        payer: input.payer,
      }),
    });

    if (!response.ok) {
      return { ok: false, reason: `facilitator status ${response.status}` };
    }

    const payload = (await response.json()) as {
      paymentSignature?: string;
      txHash?: `0x${string}`;
      reason?: string;
    };

    if (!payload.paymentSignature) {
      return { ok: false, reason: payload.reason || "missing payment signature" };
    }

    return {
      ok: true,
      paymentSignature: payload.paymentSignature,
      txHash: payload.txHash,
    };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
};

export const payDirectTransfer = async (input: {
  provider: JsonRpcProvider;
  paymentWallet: Wallet;
  challenge: PaymentChallenge;
  tokenFactory?: (
    asset: string,
    signer: Wallet
  ) => {
    transfer: (
      to: string,
      value: bigint
    ) => Promise<{
      hash: string;
      wait: () => Promise<{ status: number } | null>;
    }>;
  };
}): Promise<{ ok: boolean; txHash?: `0x${string}`; reason?: string }> => {
  try {
    const token =
      input.tokenFactory?.(input.challenge.asset, input.paymentWallet.connect(input.provider)) ||
      new Contract(input.challenge.asset, ERC20_ABI, input.paymentWallet.connect(input.provider));
    const tx = await token.transfer(input.challenge.payTo, BigInt(input.challenge.amountAtomic));
    const receipt = await tx.wait();

    if (!receipt || receipt.status !== 1) {
      return { ok: false, reason: "transfer reverted" };
    }

    return {
      ok: true,
      txHash: tx.hash as `0x${string}`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: (error as Error).message,
    };
  }
};
