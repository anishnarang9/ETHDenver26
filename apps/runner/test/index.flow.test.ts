import { describe, expect, it, vi } from "vitest";
import { JsonRpcProvider, Wallet } from "ethers";
import type { RunnerConfig } from "../src/config.js";
import {
  callPricedRoute,
  parseRunnerRoutes,
  runAutonomousLoop,
  type RunnerRuntime,
} from "../src/flow.js";

const makeRuntime = (overrides: Partial<RunnerConfig> = {}): RunnerRuntime => {
  const config: RunnerConfig = {
    GATEWAY_BASE_URL: "http://localhost:4001",
    KITE_RPC_URL: "http://localhost:8545",
    RUNNER_AGENT_PRIVATE_KEY: Wallet.createRandom().privateKey,
    RUNNER_SESSION_PRIVATE_KEY: Wallet.createRandom().privateKey,
    RUNNER_PAYMENT_PRIVATE_KEY: Wallet.createRandom().privateKey,
    RUNNER_ROUTES: "enrich-wallet",
    RUNNER_ITERATIONS: 1,
    RUNNER_DISABLE_FACILITATOR: false,
    FACILITATOR_URL: "https://facilitator.local",
    PAYMENT_ASSET: "0x00000000000000000000000000000000000000aa",
    ...overrides,
  };

  const provider = new JsonRpcProvider("http://127.0.0.1:8545");
  return {
    config,
    provider,
    agentWallet: new Wallet(config.RUNNER_AGENT_PRIVATE_KEY, provider),
    sessionWallet: new Wallet(config.RUNNER_SESSION_PRIVATE_KEY, provider),
    paymentWallet: new Wallet(config.RUNNER_PAYMENT_PRIVATE_KEY, provider),
  };
};

describe("runner flow controls", () => {
  it("parses and deduplicates selected routes", () => {
    expect(parseRunnerRoutes("enrich-wallet,premium-intel,enrich-wallet")).toEqual([
      "enrich-wallet",
      "premium-intel",
    ]);
  });

  it("throws on unknown configured routes", () => {
    expect(() => parseRunnerRoutes("enrich-wallet,unknown")).toThrow("Unknown runner route");
  });

  it("iterates selected routes deterministically", async () => {
    const runtime = makeRuntime({
      RUNNER_ROUTES: "enrich-wallet,premium-intel",
      RUNNER_ITERATIONS: 3,
    });
    const callMock = vi.fn().mockResolvedValue({
      routeKey: "enrich-wallet",
      routePath: "/api/enrich-wallet",
      success: true,
      actionId: "a-ok",
    });

    const summary = await runAutonomousLoop(
      runtime,
      {
        logger: { log: vi.fn(), error: vi.fn() },
      },
      {
        callPricedRouteFn: callMock,
      }
    );

    expect(summary.total).toBe(6);
    expect(summary.failed).toBe(0);
    expect(callMock).toHaveBeenCalledTimes(6);
  });

  it("skips facilitator payment path when disabled", async () => {
    const runtime = makeRuntime({
      RUNNER_DISABLE_FACILITATOR: true,
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            challenge: {
              actionId: "a-1",
              routeId: "api.enrich-wallet",
              asset: "0x00000000000000000000000000000000000000aa",
              amountAtomic: "100",
              payTo: "0x00000000000000000000000000000000000000bb",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
              facilitatorUrl: "https://facilitator.local",
              protocolMode: "dual",
            },
          }),
          {
            status: 402,
            headers: {
              "PAYMENT-REQUIRED": JSON.stringify({
                actionId: "a-1",
                routeId: "api.enrich-wallet",
                asset: "0x00000000000000000000000000000000000000aa",
                amountAtomic: "100",
                payTo: "0x00000000000000000000000000000000000000bb",
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                facilitatorUrl: "https://facilitator.local",
                protocolMode: "dual",
              }),
            },
          }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const payViaFacilitatorFn = vi.fn().mockResolvedValue({
      ok: true,
      paymentSignature: "never-used",
    });
    const payDirectTransferFn = vi.fn().mockResolvedValue({
      ok: true,
      txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const result = await callPricedRoute({
      runtime,
      iteration: 1,
      call: {
        routeKey: "enrich-wallet",
        routePath: "/api/enrich-wallet",
        body: {},
      },
      disableFacilitator: true,
      deps: {
        fetchFn,
        payViaFacilitatorFn,
        payDirectTransferFn,
        signEnvelopeFn: vi.fn().mockResolvedValue("0xsig"),
        randomIdFn: vi.fn().mockReturnValue("n-fixed"),
        logger: { log: vi.fn(), error: vi.fn() },
      },
    });

    expect(result.success).toBe(true);
    expect(payViaFacilitatorFn).not.toHaveBeenCalled();
    expect(payDirectTransferFn).toHaveBeenCalledTimes(1);
  });
});
