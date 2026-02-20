import { type JsonRpcProvider, type Wallet } from "ethers";
import { randomUUID } from "node:crypto";
import {
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  X_ACTION_ID_HEADER,
  X_PAYMENT_HEADER,
  X_TX_HASH_HEADER,
  type PaymentChallenge,
} from "@kite-stack/shared-types";
import type { RunnerConfig } from "./config.js";
import { payDirectTransfer, payViaFacilitator } from "./payment.js";
import { buildBodyHash, signEnvelope } from "./signing.js";

export type RunnerRouteKey = "enrich-wallet" | "premium-intel";

export interface RunnerRuntime {
  config: RunnerConfig;
  provider: JsonRpcProvider;
  agentWallet: Wallet;
  sessionWallet: Wallet;
  paymentWallet: Wallet;
}

interface CallOptions {
  routeKey: RunnerRouteKey;
  routePath: string;
  body: Record<string, unknown>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RunnerDependencies {
  fetchFn?: FetchLike;
  payViaFacilitatorFn?: typeof payViaFacilitator;
  payDirectTransferFn?: typeof payDirectTransfer;
  signEnvelopeFn?: typeof signEnvelope;
  randomIdFn?: () => string;
  logger?: Pick<Console, "log" | "error">;
}

export interface RouteRunResult {
  routeKey: RunnerRouteKey;
  routePath: string;
  success: boolean;
  actionId?: string;
  reason?: string;
}

const routeCall = (
  routeKey: RunnerRouteKey,
  agentAddress: `0x${string}`,
  iteration: number
): CallOptions => {
  if (routeKey === "enrich-wallet") {
    return {
      routeKey,
      routePath: "/api/enrich-wallet",
      body: {
        walletAddress: agentAddress,
        activityHint: `hackathon-demo-${iteration}`,
      },
    };
  }

  return {
    routeKey,
    routePath: "/api/premium-intel",
    body: {
      walletAddress: agentAddress,
      request: `high-signal-profile-${iteration}`,
    },
  };
};

const parseChallenge = (
  response: Response,
  payload: { challenge?: PaymentChallenge }
): PaymentChallenge | null => {
  const headerChallenge = response.headers.get(PAYMENT_REQUIRED_HEADER);

  if (headerChallenge) {
    try {
      return JSON.parse(headerChallenge) as PaymentChallenge;
    } catch {
      return payload.challenge ?? null;
    }
  }

  return payload.challenge ?? null;
};

export const parseRunnerRoutes = (value: string): RunnerRouteKey[] => {
  const raw = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const selected = raw.length > 0 ? raw : ["enrich-wallet"];
  const known = new Set<RunnerRouteKey>(["enrich-wallet", "premium-intel"]);
  const unique: RunnerRouteKey[] = [];
  const seen = new Set<string>();

  for (const item of selected) {
    if (!known.has(item as RunnerRouteKey)) {
      throw new Error(`Unknown runner route: ${item}`);
    }
    if (!seen.has(item)) {
      seen.add(item);
      unique.push(item as RunnerRouteKey);
    }
  }

  return unique;
};

export interface CallPricedRouteInput {
  runtime: RunnerRuntime;
  call: CallOptions;
  iteration: number;
  disableFacilitator?: boolean;
  deps?: RunnerDependencies;
}

export const callPricedRoute = async (input: CallPricedRouteInput): Promise<RouteRunResult> => {
  const deps = input.deps ?? {};
  const fetchFn = deps.fetchFn ?? fetch;
  const payViaFacilitatorFn = deps.payViaFacilitatorFn ?? payViaFacilitator;
  const payDirectTransferFn = deps.payDirectTransferFn ?? payDirectTransfer;
  const signEnvelopeFn = deps.signEnvelopeFn ?? signEnvelope;
  const randomIdFn = deps.randomIdFn ?? randomUUID;
  const logger = deps.logger ?? console;

  const bodyHash = buildBodyHash(input.call.body);
  const buildSignedHeaders = async (actionId: string) => {
    const timestamp = new Date().toISOString();
    const nonce = randomIdFn();
    const signature = await signEnvelopeFn({
      sessionWallet: input.runtime.sessionWallet,
      agentAddress: input.runtime.agentWallet.address as `0x${string}`,
      sessionAddress: input.runtime.sessionWallet.address as `0x${string}`,
      timestamp,
      nonce,
      bodyHash,
    });

    return {
      "content-type": "application/json",
      "x-agent-address": input.runtime.agentWallet.address,
      "x-session-address": input.runtime.sessionWallet.address,
      "x-timestamp": timestamp,
      "x-nonce": nonce,
      "x-body-hash": bodyHash,
      "x-signature": signature,
      [X_ACTION_ID_HEADER]: actionId,
    } as Record<string, string>;
  };

  const firstActionId = randomIdFn();
  const baseHeaders = await buildSignedHeaders(firstActionId);

  const firstResponse = await fetchFn(`${input.runtime.config.GATEWAY_BASE_URL}${input.call.routePath}`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(input.call.body),
  });

  if (firstResponse.status !== 402) {
    const text = await firstResponse.text();
    return {
      routeKey: input.call.routeKey,
      routePath: input.call.routePath,
      success: false,
      reason: `expected 402, got ${firstResponse.status} -> ${text}`,
    };
  }

  const bodyPayload = (await firstResponse.json()) as { challenge?: PaymentChallenge };
  const challenge = parseChallenge(firstResponse, bodyPayload);

  if (!challenge) {
    return {
      routeKey: input.call.routeKey,
      routePath: input.call.routePath,
      success: false,
      reason: "402 did not include challenge",
    };
  }

  logger.log(
    `[runner] iter=${input.iteration} route=${input.call.routePath} challenge actionId=${challenge.actionId} amount=${challenge.amountAtomic}`
  );

  const retryHeaders = await buildSignedHeaders(challenge.actionId);

  let facilitatorResult:
    | {
        ok: boolean;
        paymentSignature?: string;
        txHash?: `0x${string}`;
        reason?: string;
      }
    | undefined;

  if (!input.disableFacilitator) {
    facilitatorResult = await payViaFacilitatorFn({
      facilitatorUrl: input.runtime.config.FACILITATOR_URL || challenge.facilitatorUrl,
      challenge,
      payer: input.runtime.paymentWallet.address as `0x${string}`,
    });
  }

  if (facilitatorResult?.ok && facilitatorResult.paymentSignature) {
    retryHeaders[PAYMENT_SIGNATURE_HEADER] = facilitatorResult.paymentSignature;
    if (facilitatorResult.txHash) {
      retryHeaders[X_TX_HASH_HEADER] = facilitatorResult.txHash;
    }
    retryHeaders[X_PAYMENT_HEADER] = facilitatorResult.paymentSignature;
  } else {
    const reason = input.disableFacilitator
      ? "facilitator disabled by config"
      : facilitatorResult?.reason || "facilitator unavailable";
    logger.log(`[runner] iter=${input.iteration} route=${input.call.routePath} direct transfer fallback (${reason})`);

    const transfer = await payDirectTransferFn({
      provider: input.runtime.provider,
      paymentWallet: input.runtime.paymentWallet,
      challenge,
    });

    if (!transfer.ok || !transfer.txHash) {
      return {
        routeKey: input.call.routeKey,
        routePath: input.call.routePath,
        success: false,
        actionId: challenge.actionId,
        reason: `direct transfer failed: ${transfer.reason}`,
      };
    }

    retryHeaders[X_TX_HASH_HEADER] = transfer.txHash;
  }

  const secondResponse = await fetchFn(`${input.runtime.config.GATEWAY_BASE_URL}${input.call.routePath}`, {
    method: "POST",
    headers: retryHeaders,
    body: JSON.stringify(input.call.body),
  });

  if (!secondResponse.ok) {
    return {
      routeKey: input.call.routeKey,
      routePath: input.call.routePath,
      success: false,
      actionId: challenge.actionId,
      reason: `retry failed: status ${secondResponse.status} ${await secondResponse.text()}`,
    };
  }

  await secondResponse.json();
  return {
    routeKey: input.call.routeKey,
    routePath: input.call.routePath,
    success: true,
    actionId: challenge.actionId,
  };
};

export const runAutonomousLoop = async (
  runtime: RunnerRuntime,
  deps: RunnerDependencies = {},
  options?: {
    callPricedRouteFn?: (input: CallPricedRouteInput) => Promise<RouteRunResult>;
  }
) => {
  const logger = deps.logger ?? console;
  const routeKeys = parseRunnerRoutes(runtime.config.RUNNER_ROUTES);
  const callFn = options?.callPricedRouteFn ?? callPricedRoute;
  const results: RouteRunResult[] = [];

  logger.log("[runner] starting autonomous loop");
  logger.log(
    `[runner] agent=${runtime.agentWallet.address} session=${runtime.sessionWallet.address} payer=${runtime.paymentWallet.address}`
  );
  logger.log(
    `[runner] routes=${routeKeys.join(",")} iterations=${runtime.config.RUNNER_ITERATIONS} disableFacilitator=${runtime.config.RUNNER_DISABLE_FACILITATOR}`
  );

  for (let iteration = 1; iteration <= runtime.config.RUNNER_ITERATIONS; iteration += 1) {
    for (const routeKey of routeKeys) {
      const call = routeCall(routeKey, runtime.agentWallet.address as `0x${string}`, iteration);
      const result = await callFn({
        runtime,
        call,
        iteration,
        disableFacilitator: runtime.config.RUNNER_DISABLE_FACILITATOR,
        deps,
      });
      results.push(result);

      if (result.success) {
        logger.log(`[runner] iter=${iteration} route=${call.routePath} success actionId=${result.actionId}`);
      } else {
        logger.error(`[runner] iter=${iteration} route=${call.routePath} failed: ${result.reason}`);
      }
    }
  }

  const passed = results.filter((item) => item.success).length;
  const failed = results.length - passed;
  logger.log(`[runner] complete total=${results.length} passed=${passed} failed=${failed}`);

  return {
    total: results.length,
    passed,
    failed,
    results,
  };
};
