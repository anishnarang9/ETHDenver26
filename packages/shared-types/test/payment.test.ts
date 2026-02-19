import { describe, expect, it } from "vitest";
import {
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  X_ACTION_ID_HEADER,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  X_TX_HASH_HEADER,
  type PaymentChallenge,
} from "../src/payment.js";

describe("shared payment constants", () => {
  it("exposes dual protocol headers", () => {
    expect(PAYMENT_REQUIRED_HEADER).toBe("PAYMENT-REQUIRED");
    expect(PAYMENT_RESPONSE_HEADER).toBe("PAYMENT-RESPONSE");
    expect(PAYMENT_SIGNATURE_HEADER).toBe("PAYMENT-SIGNATURE");
    expect(X_PAYMENT_HEADER).toBe("X-PAYMENT");
    expect(X_PAYMENT_RESPONSE_HEADER).toBe("X-PAYMENT-RESPONSE");
    expect(X_TX_HASH_HEADER).toBe("X-TX-HASH");
    expect(X_ACTION_ID_HEADER).toBe("X-ACTION-ID");
  });

  it("serializes payment challenge payload", () => {
    const challenge: PaymentChallenge = {
      actionId: "action-1",
      routeId: "api.enrich-wallet",
      asset: "0x00000000000000000000000000000000000000aa",
      amountAtomic: "1000",
      payTo: "0x00000000000000000000000000000000000000bb",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      facilitatorUrl: "https://facilitator.local",
      protocolMode: "dual",
    };

    const parsed = JSON.parse(JSON.stringify(challenge)) as PaymentChallenge;
    expect(parsed.actionId).toBe("action-1");
    expect(parsed.protocolMode).toBe("dual");
  });
});
