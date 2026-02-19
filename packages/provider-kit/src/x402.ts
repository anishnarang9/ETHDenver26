import { randomUUID } from "node:crypto";
import type { RoutePolicy, PaymentChallenge } from "@kite-stack/shared-types";
import type { PaymentService, PaymentVerifyInput, PaymentVerification } from "./types.js";

export class DefaultPaymentService implements PaymentService {
  constructor(
    private readonly facilitatorUrl: string,
    private readonly quoteTtlSeconds = 120
  ) {}

  async buildQuote(input: {
    actionId: string;
    routePolicy: RoutePolicy;
    payTo: `0x${string}`;
    asset: `0x${string}`;
  }): Promise<PaymentChallenge> {
    return {
      actionId: input.actionId || randomUUID(),
      routeId: input.routePolicy.routeId,
      asset: input.asset,
      amountAtomic: input.routePolicy.priceAtomic,
      payTo: input.payTo,
      expiresAt: new Date(Date.now() + this.quoteTtlSeconds * 1000).toISOString(),
      facilitatorUrl: this.facilitatorUrl,
      protocolMode: "dual",
    };
  }

  async verifyPayment(input: PaymentVerifyInput): Promise<PaymentVerification> {
    if (input.proof.protocol === "direct-transfer") {
      if (!input.proof.txHash) {
        return {
          verified: false,
          settlementRef: "",
          payer: input.agentAddress,
          amountAtomic: input.challenge.amountAtomic,
          mode: "direct",
          reason: "missing tx hash",
        };
      }

      return {
        verified: true,
        settlementRef: `direct:${input.proof.txHash}`,
        txHash: input.proof.txHash,
        payer: input.agentAddress,
        amountAtomic: input.challenge.amountAtomic,
        mode: "direct",
      };
    }

    if (!input.proof.signature) {
      return {
        verified: false,
        settlementRef: "",
        payer: input.agentAddress,
        amountAtomic: input.challenge.amountAtomic,
        mode: "facilitator",
        reason: "missing payment signature",
      };
    }

    return {
      verified: true,
      settlementRef: `facilitator:${input.challenge.actionId}`,
      payer: input.agentAddress,
      amountAtomic: input.challenge.amountAtomic,
      mode: "facilitator",
    };
  }
}
