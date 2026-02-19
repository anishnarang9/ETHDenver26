import { randomUUID } from "node:crypto";
import { JsonRpcProvider, Wallet } from "ethers";
import {
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  X_ACTION_ID_HEADER,
  X_PAYMENT_HEADER,
  X_TX_HASH_HEADER,
  type PaymentChallenge,
} from "@kite-stack/shared-types";
import { loadRunnerConfig } from "./config.js";
import { payDirectTransfer, payViaFacilitator } from "./payment.js";
import { buildBodyHash, signEnvelope } from "./signing.js";

const config = loadRunnerConfig();
const provider = new JsonRpcProvider(config.KITE_RPC_URL);

const agentWallet = new Wallet(config.RUNNER_AGENT_PRIVATE_KEY, provider);
const sessionWallet = new Wallet(config.RUNNER_SESSION_PRIVATE_KEY, provider);
const paymentWallet = new Wallet(config.RUNNER_PAYMENT_PRIVATE_KEY, provider);

interface CallOptions {
  routePath: string;
  body: Record<string, unknown>;
}

const callPricedRoute = async ({ routePath, body }: CallOptions): Promise<void> => {
  const bodyHash = buildBodyHash(body);
  const buildSignedHeaders = async (actionId: string) => {
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const signature = await signEnvelope({
      sessionWallet,
      agentAddress: agentWallet.address as `0x${string}`,
      sessionAddress: sessionWallet.address as `0x${string}`,
      timestamp,
      nonce,
      bodyHash,
    });

    return {
      "content-type": "application/json",
      "x-agent-address": agentWallet.address,
      "x-session-address": sessionWallet.address,
      "x-timestamp": timestamp,
      "x-nonce": nonce,
      "x-body-hash": bodyHash,
      "x-signature": signature,
      [X_ACTION_ID_HEADER]: actionId,
    } as Record<string, string>;
  };

  const firstActionId = randomUUID();
  const baseHeaders = await buildSignedHeaders(firstActionId);

  const firstResponse = await fetch(`${config.GATEWAY_BASE_URL}${routePath}`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(body),
  });

  if (firstResponse.status !== 402) {
    const text = await firstResponse.text();
    console.log(`[runner] route ${routePath}: expected 402, got ${firstResponse.status} -> ${text}`);
    return;
  }

  const headerChallenge = firstResponse.headers.get(PAYMENT_REQUIRED_HEADER);
  const bodyPayload = (await firstResponse.json()) as { challenge?: PaymentChallenge };
  const challenge =
    (headerChallenge ? (JSON.parse(headerChallenge) as PaymentChallenge) : undefined) || bodyPayload.challenge;

  if (!challenge) {
    console.log(`[runner] route ${routePath}: 402 did not include challenge`);
    return;
  }

  console.log(`[runner] challenge received for ${routePath}: actionId=${challenge.actionId} amount=${challenge.amountAtomic}`);

  const facilitatorResult = await payViaFacilitator({
    facilitatorUrl: config.FACILITATOR_URL || challenge.facilitatorUrl,
    challenge,
    payer: paymentWallet.address as `0x${string}`,
  });

  const retryHeaders = await buildSignedHeaders(challenge.actionId);

  if (facilitatorResult.ok && facilitatorResult.paymentSignature) {
    retryHeaders[PAYMENT_SIGNATURE_HEADER] = facilitatorResult.paymentSignature;
    if (facilitatorResult.txHash) {
      retryHeaders[X_TX_HASH_HEADER] = facilitatorResult.txHash;
    }
    retryHeaders[X_PAYMENT_HEADER] = facilitatorResult.paymentSignature;
  } else {
    console.log(`[runner] facilitator payment unavailable (${facilitatorResult.reason}), falling back to direct transfer`);
    const transfer = await payDirectTransfer({
      provider,
      paymentWallet,
      challenge,
    });

    if (!transfer.ok || !transfer.txHash) {
      console.log(`[runner] direct transfer failed for ${routePath}: ${transfer.reason}`);
      return;
    }

    retryHeaders[X_TX_HASH_HEADER] = transfer.txHash;
  }

  const secondResponse = await fetch(`${config.GATEWAY_BASE_URL}${routePath}`, {
    method: "POST",
    headers: retryHeaders,
    body: JSON.stringify(body),
  });

  if (!secondResponse.ok) {
    console.log(`[runner] retry failed ${routePath}: status ${secondResponse.status}`, await secondResponse.text());
    return;
  }

  const result = await secondResponse.json();
  console.log(`[runner] success ${routePath}:`, result);
};

const main = async () => {
  console.log("[runner] starting autonomous loop");
  console.log(`[runner] agent=${agentWallet.address} session=${sessionWallet.address} payer=${paymentWallet.address}`);

  await callPricedRoute({
    routePath: "/api/enrich-wallet",
    body: {
      walletAddress: agentWallet.address,
      activityHint: "hackathon-demo",
    },
  });

  await callPricedRoute({
    routePath: "/api/premium-intel",
    body: {
      walletAddress: agentWallet.address,
      request: "high-signal-profile",
    },
  });

  console.log("[runner] complete");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
