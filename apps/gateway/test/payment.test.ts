import { afterEach, describe, expect, it, vi } from "vitest";
import { Interface } from "ethers";
import { KitePaymentService } from "../src/payment.js";

const transferInterface = new Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

const challenge = {
  actionId: "a1",
  routeId: "api.enrich-wallet",
  asset: "0x00000000000000000000000000000000000000bb" as `0x${string}`,
  amountAtomic: "100",
  payTo: "0x00000000000000000000000000000000000000cc" as `0x${string}`,
  expiresAt: new Date(Date.now() + 10000).toISOString(),
  facilitatorUrl: "https://facilitator.local",
  protocolMode: "dual" as const,
};

describe("KitePaymentService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fails direct transfer verification without txHash", async () => {
    const svc = new KitePaymentService("", { getTransactionReceipt: vi.fn() } as never);

    const result = await svc.verifyPayment({
      agentAddress: "0x0000000000000000000000000000000000000011",
      challenge,
      proof: {
        actionId: "a1",
        protocol: "direct-transfer",
      },
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("missing transaction hash");
  });

  it("returns verified facilitator settlement when verify endpoint succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          verified: true,
          settlementRef: "facilitator:settle-1",
          txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          payer: "0x0000000000000000000000000000000000000011",
          amountAtomic: "100",
        }),
      })
    );

    const svc = new KitePaymentService("https://facilitator.local", { getTransactionReceipt: vi.fn() } as never);

    const result = await svc.verifyPayment({
      agentAddress: "0x0000000000000000000000000000000000000011",
      challenge,
      proof: {
        actionId: "a1",
        protocol: "payment-signature",
        signature: "0xsigned",
      },
    });

    expect(result.verified).toBe(true);
    expect(result.mode).toBe("facilitator");
    expect(result.settlementRef).toBe("facilitator:settle-1");
  });

  it("falls back to direct transfer when facilitator rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ verified: false, reason: "quote expired" }),
      })
    );

    const encoded = transferInterface.encodeEventLog(transferInterface.getEvent("Transfer"), [
      "0x0000000000000000000000000000000000000011",
      challenge.payTo,
      100n,
    ]);

    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: 1,
        logs: [
          {
            address: challenge.asset,
            topics: encoded.topics,
            data: encoded.data,
          },
        ],
      }),
    };

    const svc = new KitePaymentService("https://facilitator.local", provider as never);

    const result = await svc.verifyPayment({
      agentAddress: "0x0000000000000000000000000000000000000011",
      challenge,
      proof: {
        actionId: "a1",
        protocol: "payment-signature",
        signature: "0xsigned",
        txHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });

    expect(result.verified).toBe(true);
    expect(result.mode).toBe("direct");
    expect(result.txHash).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("fails direct verification when transfer log does not match quote recipient", async () => {
    const encoded = transferInterface.encodeEventLog(transferInterface.getEvent("Transfer"), [
      "0x0000000000000000000000000000000000000011",
      "0x00000000000000000000000000000000000000ff",
      100n,
    ]);

    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: 1,
        logs: [
          {
            address: challenge.asset,
            topics: encoded.topics,
            data: encoded.data,
          },
        ],
      }),
    };

    const svc = new KitePaymentService("", provider as never);

    const result = await svc.verifyPayment({
      agentAddress: "0x0000000000000000000000000000000000000011",
      challenge,
      proof: {
        actionId: "a1",
        protocol: "direct-transfer",
        txHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("no matching transfer log");
  });

  it("fails direct verification when transfer asset does not match quote asset", async () => {
    const encoded = transferInterface.encodeEventLog(transferInterface.getEvent("Transfer"), [
      "0x0000000000000000000000000000000000000011",
      challenge.payTo,
      100n,
    ]);

    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: 1,
        logs: [
          {
            address: "0x00000000000000000000000000000000000000dd",
            topics: encoded.topics,
            data: encoded.data,
          },
        ],
      }),
    };

    const svc = new KitePaymentService("", provider as never);

    const result = await svc.verifyPayment({
      agentAddress: "0x0000000000000000000000000000000000000011",
      challenge,
      proof: {
        actionId: "a1",
        protocol: "direct-transfer",
        txHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      },
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("no matching transfer log");
  });

  it("fails direct verification when transfer value is below quoted amount", async () => {
    const encoded = transferInterface.encodeEventLog(transferInterface.getEvent("Transfer"), [
      "0x0000000000000000000000000000000000000011",
      challenge.payTo,
      99n,
    ]);

    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: 1,
        logs: [
          {
            address: challenge.asset,
            topics: encoded.topics,
            data: encoded.data,
          },
        ],
      }),
    };

    const svc = new KitePaymentService("", provider as never);

    const result = await svc.verifyPayment({
      agentAddress: "0x0000000000000000000000000000000000000011",
      challenge,
      proof: {
        actionId: "a1",
        protocol: "direct-transfer",
        txHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      },
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("no matching transfer log");
  });
});
