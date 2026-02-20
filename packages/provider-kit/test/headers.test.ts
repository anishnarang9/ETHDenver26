import { describe, expect, it } from "vitest";
import {
  buildChallengeHeaders,
  readEnvelope,
  readPaymentProof,
  HEADER_AGENT,
  HEADER_BODY_HASH,
  HEADER_NONCE,
  HEADER_SESSION,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
} from "../src/headers.js";

describe("provider-kit headers", () => {
  it("reads signed envelope headers", () => {
    const envelope = readEnvelope({
      [HEADER_AGENT]: "0x0000000000000000000000000000000000000001",
      [HEADER_SESSION]: "0x0000000000000000000000000000000000000002",
      [HEADER_TIMESTAMP]: "2026-01-01T00:00:00.000Z",
      [HEADER_NONCE]: "n-1",
      [HEADER_BODY_HASH]: "0xhash",
      [HEADER_SIGNATURE]: "0xsig",
    });

    expect(envelope).not.toBeNull();
    expect(envelope?.nonce).toBe("n-1");
  });

  it("returns null when signed envelope headers are incomplete", () => {
    const envelope = readEnvelope({
      [HEADER_AGENT]: "0x0000000000000000000000000000000000000001",
      [HEADER_SESSION]: "0x0000000000000000000000000000000000000002",
      [HEADER_TIMESTAMP]: "2026-01-01T00:00:00.000Z",
      [HEADER_NONCE]: "n-1",
      [HEADER_BODY_HASH]: "0xhash",
    });

    expect(envelope).toBeNull();
  });

  it("supports payment proof parsing for dual header formats", () => {
    const legacy = readPaymentProof({
      "x-payment": "0xlegacy",
      "x-action-id": "a-1",
    });

    const v2 = readPaymentProof({
      "payment-signature": "0xv2",
      "x-action-id": "a-2",
      "x-tx-hash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const direct = readPaymentProof({
      "x-action-id": "a-3",
      "x-tx-hash": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });

    expect(legacy?.protocol).toBe("x-payment");
    expect(v2?.protocol).toBe("payment-signature");
    expect(v2?.txHash).toMatch(/^0x/);
    expect(direct?.protocol).toBe("direct-transfer");
  });

  it("returns null payment proof when action id is missing", () => {
    const proof = readPaymentProof({
      "payment-signature": "0xv2",
    });

    expect(proof).toBeNull();
  });

  it("builds challenge headers for both protocols", () => {
    const headers = buildChallengeHeaders({
      actionId: "a-9",
      routeId: "api.enrich-wallet",
      asset: "0x00000000000000000000000000000000000000aa",
      amountAtomic: "100",
      payTo: "0x00000000000000000000000000000000000000bb",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      facilitatorUrl: "https://facilitator.local",
      protocolMode: "dual",
    });

    expect(headers["PAYMENT-REQUIRED"]).toContain("a-9");
    expect(headers["X-PAYMENT-RESPONSE"]).toContain("api.enrich-wallet");
    expect(headers["X-ACTION-ID"]).toBe("a-9");
  });
});
