import { Interface, id } from "ethers";
import type { JsonRpcProvider } from "ethers";
import type { PaymentService, PaymentVerifyInput, PaymentVerification } from "@kite-stack/provider-kit";
import type { RoutePolicy } from "@kite-stack/shared-types";

interface FacilitatorVerifyResponse {
  verified: boolean;
  settlementRef?: string;
  txHash?: `0x${string}`;
  payer?: `0x${string}`;
  amountAtomic?: string;
  reason?: string;
}

export class KitePaymentService implements PaymentService {
  private readonly erc20Interface = new Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ]);

  constructor(
    private readonly facilitatorUrl: string,
    private readonly provider: JsonRpcProvider
  ) {}

  async buildQuote(input: {
    actionId: string;
    routePolicy: RoutePolicy;
    payTo: `0x${string}`;
    asset: `0x${string}`;
  }) {
    return {
      actionId: input.actionId,
      routeId: input.routePolicy.routeId,
      asset: input.asset,
      amountAtomic: input.routePolicy.priceAtomic,
      payTo: input.payTo,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      facilitatorUrl: this.facilitatorUrl,
      protocolMode: "dual" as const,
    };
  }

  async verifyPayment(input: PaymentVerifyInput): Promise<PaymentVerification> {
    if (input.proof.protocol === "direct-transfer") {
      return this.verifyDirectTransfer(input);
    }

    const facilitatorResult = await this.verifyViaFacilitator(input);
    if (facilitatorResult.verified) {
      return facilitatorResult;
    }

    if (input.proof.txHash) {
      return this.verifyDirectTransfer(input);
    }

    return facilitatorResult;
  }

  private async verifyViaFacilitator(input: PaymentVerifyInput): Promise<PaymentVerification> {
    if (!this.facilitatorUrl || !input.proof.signature) {
      return {
        verified: false,
        settlementRef: "",
        payer: input.agentAddress,
        amountAtomic: input.challenge.amountAtomic,
        mode: "facilitator",
        reason: "facilitator unavailable or missing signature",
      };
    }

    try {
      const response = await fetch(`${this.facilitatorUrl}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionId: input.challenge.actionId,
          quote: input.challenge,
          paymentSignature: input.proof.signature,
        }),
      });

      if (!response.ok) {
        return {
          verified: false,
          settlementRef: "",
          payer: input.agentAddress,
          amountAtomic: input.challenge.amountAtomic,
          mode: "facilitator",
          reason: `facilitator status ${response.status}`,
        };
      }

      const payload = (await response.json()) as FacilitatorVerifyResponse;
      if (!payload.verified) {
        return {
          verified: false,
          settlementRef: payload.settlementRef || "",
          payer: payload.payer || input.agentAddress,
          amountAtomic: payload.amountAtomic || input.challenge.amountAtomic,
          mode: "facilitator",
          txHash: payload.txHash,
          reason: payload.reason || "facilitator rejected payment",
        };
      }

      return {
        verified: true,
        settlementRef: payload.settlementRef || `facilitator:${input.challenge.actionId}`,
        txHash: payload.txHash,
        payer: payload.payer || input.agentAddress,
        amountAtomic: payload.amountAtomic || input.challenge.amountAtomic,
        mode: "facilitator",
      };
    } catch (error) {
      return {
        verified: false,
        settlementRef: "",
        payer: input.agentAddress,
        amountAtomic: input.challenge.amountAtomic,
        mode: "facilitator",
        reason: `facilitator request failed: ${(error as Error).message}`,
      };
    }
  }

  private async verifyDirectTransfer(input: PaymentVerifyInput): Promise<PaymentVerification> {
    if (!input.proof.txHash) {
      return {
        verified: false,
        settlementRef: "",
        payer: input.agentAddress,
        amountAtomic: input.challenge.amountAtomic,
        mode: "direct",
        reason: "missing transaction hash",
      };
    }

    const receipt = await this.provider.getTransactionReceipt(input.proof.txHash);
    if (!receipt || receipt.status !== 1) {
      return {
        verified: false,
        settlementRef: "",
        payer: input.agentAddress,
        amountAtomic: input.challenge.amountAtomic,
        mode: "direct",
        reason: "transaction missing or reverted",
      };
    }

    const transferTopic = id("Transfer(address,address,uint256)");

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== input.challenge.asset.toLowerCase()) {
        continue;
      }

      if (log.topics[0]?.toLowerCase() !== transferTopic.toLowerCase()) {
        continue;
      }

      let from: `0x${string}`;
      let to: `0x${string}`;
      let value: bigint;

      try {
        const parsed = this.erc20Interface.parseLog(log);
        from = String(parsed?.args[0]).toLowerCase() as `0x${string}`;
        to = String(parsed?.args[1]).toLowerCase() as `0x${string}`;
        value = BigInt(parsed?.args[2]?.toString() ?? "0");
      } catch {
        continue;
      }

      if (to !== input.challenge.payTo.toLowerCase()) {
        continue;
      }

      if (value < BigInt(input.challenge.amountAtomic)) {
        continue;
      }

      return {
        verified: true,
        settlementRef: `direct:${input.proof.txHash}`,
        txHash: input.proof.txHash,
        payer: from,
        amountAtomic: value.toString(),
        mode: "direct",
      };
    }

    return {
      verified: false,
      settlementRef: "",
      txHash: input.proof.txHash,
      payer: input.agentAddress,
      amountAtomic: input.challenge.amountAtomic,
      mode: "direct",
      reason: "no matching transfer log found",
    };
  }
}
