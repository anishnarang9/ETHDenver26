import { describe, expect, it, vi, afterEach } from "vitest";
import { JsonRpcProvider, Wallet } from "ethers";
import { payDirectTransfer, payViaFacilitator } from "../src/payment.js";

const challenge = {
  actionId: "action-1",
  routeId: "api.enrich-wallet",
  asset: "0x00000000000000000000000000000000000000aa" as `0x${string}`,
  amountAtomic: "100",
  payTo: "0x00000000000000000000000000000000000000bb" as `0x${string}`,
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  facilitatorUrl: "https://facilitator.local",
  protocolMode: "dual" as const,
};

describe("runner payment helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns payment signature from facilitator", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ paymentSignature: "0xsig", txHash: "0xabc" }),
      })
    );

    const result = await payViaFacilitator({
      facilitatorUrl: "https://facilitator.local",
      challenge,
      payer: Wallet.createRandom().address as `0x${string}`,
    });

    expect(result.ok).toBe(true);
    expect(result.paymentSignature).toBe("0xsig");
  });

  it("handles facilitator error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
      })
    );

    const result = await payViaFacilitator({
      facilitatorUrl: "https://facilitator.local",
      challenge,
      payer: Wallet.createRandom().address as `0x${string}`,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("402");
  });

  it("uses injected token transfer path for direct payments", async () => {
    const txHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
    const result = await payDirectTransfer({
      provider: new JsonRpcProvider("http://127.0.0.1:8545"),
      paymentWallet: Wallet.createRandom(),
      challenge,
      tokenFactory: () => ({
        transfer: async () => ({
          hash: txHash,
          wait: async () => ({ status: 1 }),
        }),
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.txHash).toBe(txHash);
  });

  it("fails direct transfer when receipt status is not successful", async () => {
    const result = await payDirectTransfer({
      provider: new JsonRpcProvider("http://127.0.0.1:8545"),
      paymentWallet: Wallet.createRandom(),
      challenge,
      tokenFactory: () => ({
        transfer: async () => ({
          hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          wait: async () => ({ status: 0 }),
        }),
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("reverted");
  });
});
