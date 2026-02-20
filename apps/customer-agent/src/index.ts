import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Contract, JsonRpcProvider, Wallet, hexlify, randomBytes } from "ethers";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { NETWORKS as X402_V1_EVM_NETWORKS } from "@x402/evm/v1";
import { privateKeyToAccount } from "viem/accounts";
import {
  PAYMENT_REQUIRED_HEADER,
  X_ACTION_ID_HEADER,
  X_PAYMENT_HEADER,
  X_TX_HASH_HEADER,
  type PaymentChallenge,
} from "@kite-stack/shared-types";
import { z } from "zod";
import { buildBodyHash, signEnvelope } from "./signing.js";
import { GokiteAaSchemeClient } from "./gokiteAa.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(moduleDir, "../.env.customer-agent") });

const ERC20_ABI = ["function transfer(address to, uint256 value) returns (bool)"];
const optionalNonEmptyString = z.string().optional().transform((value) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
});

const ConfigSchema = z.object({
  GATEWAY_BASE_URL: z.string().optional().default("http://localhost:4001"),
  KITE_RPC_URL: z.string().min(1),
  CUSTOMER_AGENT_PRIVATE_KEY: z.string().optional(),
  CUSTOMER_SESSION_PRIVATE_KEY: z.string().optional(),
  CUSTOMER_PAYMENT_PRIVATE_KEY: z.string().optional(),
  CUSTOMER_LOCATION: z.string().optional().default("New York"),
  CUSTOMER_PRIMARY_ROUTE: z.string().optional().default("/api/x402-proxy"),
  CUSTOMER_PRIMARY_UPSTREAM_URL: z.string().optional().default("https://x402.dev.gokite.ai/api/weather"),
  CUSTOMER_PRIMARY_METHOD: z.enum(["GET", "POST"]).optional().default("GET"),
  CUSTOMER_FALLBACK_ROUTE: z.string().optional().default("/api/weather-fallback"),
  CUSTOMER_ENABLE_GOKITE_AA: z
    .string()
    .optional()
    .default("true")
    .transform((value) => value.toLowerCase() === "true"),
  CUSTOMER_KITE_AA_NETWORK: z.string().optional().default("kite-testnet"),
  CUSTOMER_KITE_AA_CHAIN_ID: z.string().regex(/^\d+$/).optional().default("2368"),
  CUSTOMER_KITE_AA_PAYER_ADDRESS: optionalNonEmptyString,
  CUSTOMER_KITE_AA_SESSION_ID: optionalNonEmptyString,
  CUSTOMER_ENABLE_X402_AUTOPAY: z
    .string()
    .optional()
    .default("true")
    .transform((value) => value.toLowerCase() === "true"),
});

const config = ConfigSchema.parse(process.env);
const provider = new JsonRpcProvider(config.KITE_RPC_URL);

const asString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
};

const shorten = (value: string, max = 280): string =>
  value.length <= max ? value : `${value.slice(0, max)}...`;

const asPaymentRequired = (payload: unknown): PaymentRequired | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const candidate = payload as {
    x402Version?: unknown;
    accepts?: unknown;
  };

  if (typeof candidate.x402Version !== "number") {
    return null;
  }

  if (!Array.isArray(candidate.accepts)) {
    return null;
  }

  return candidate as PaymentRequired;
};

const summarizePaymentOptions = (paymentRequired: PaymentRequired): string =>
  paymentRequired.accepts.map((offer) => `${offer.scheme}@${offer.network}`).join(", ");

const supportsOffer = (paymentRequired: PaymentRequired, offer: PaymentRequirements): boolean => {
  if (offer.scheme !== "exact") {
    return (
      config.CUSTOMER_ENABLE_GOKITE_AA &&
      offer.scheme === "gokite-aa" &&
      offer.network === config.CUSTOMER_KITE_AA_NETWORK
    );
  }
  if (paymentRequired.x402Version === 1) {
    return X402_V1_EVM_NETWORKS.includes(offer.network);
  }
  return offer.network.startsWith("eip155:");
};

const buildSignedGatewayFetch = (input: {
  agentAddress: `0x${string}`;
  sessionAddress: `0x${string}`;
  sessionWallet: Wallet;
}) => {
  const normalizedGateway = config.GATEWAY_BASE_URL.replace(/\/$/, "");

  return async (requestInfo: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(requestInfo, init);
    const requestUrl = request.url;
    if (!requestUrl.startsWith(normalizedGateway)) {
      return fetch(request);
    }

    const bodyText = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
    let bodyForHash: unknown = {};
    if (bodyText) {
      try {
        bodyForHash = JSON.parse(bodyText);
      } catch {
        bodyForHash = { raw: bodyText };
      }
    }

    const headers = new Headers(request.headers);
    const actionId = headers.get(X_ACTION_ID_HEADER) || randomUUID();
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const bodyHash = buildBodyHash(bodyForHash);
    const signature = await signEnvelope({
      sessionWallet: input.sessionWallet,
      agentAddress: input.agentAddress,
      sessionAddress: input.sessionAddress,
      timestamp,
      nonce,
      bodyHash,
    });

    headers.set("x-agent-address", input.agentAddress);
    headers.set("x-session-address", input.sessionAddress);
    headers.set("x-timestamp", timestamp);
    headers.set("x-nonce", nonce);
    headers.set("x-body-hash", bodyHash);
    headers.set("x-signature", signature);
    headers.set(X_ACTION_ID_HEADER, actionId);

    return fetch(requestUrl, {
      method: request.method,
      headers,
      body: bodyText || undefined,
      redirect: request.redirect,
      signal: request.signal,
    });
  };
};

const parseJsonSafe = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return text ? { message: text } : {};
};

const parseChallenge = (response: Response, payload: unknown): PaymentChallenge | null => {
  const encoded = response.headers.get(PAYMENT_REQUIRED_HEADER);
  if (encoded) {
    try {
      return JSON.parse(encoded) as PaymentChallenge;
    } catch {
      return null;
    }
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const nested = (payload as { challenge?: unknown }).challenge;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as PaymentChallenge;
    }
  }
  return null;
};

type GokitePaymentOffer = PaymentRequirements & {
  maxAmountRequired?: string;
  maxTimeoutSeconds?: number;
};

const resolveGokiteAmount = (offer: GokitePaymentOffer): string => {
  if (typeof offer.maxAmountRequired === "string" && offer.maxAmountRequired.length > 0) {
    return offer.maxAmountRequired;
  }
  const amount = (offer as { amount?: unknown }).amount;
  if (typeof amount === "string" && amount.length > 0) {
    return amount;
  }
  throw new Error("gokite-aa offer missing maxAmountRequired");
};

const createLegacyGokiteXPayment = async (offer: GokitePaymentOffer): Promise<string> => {
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const timeoutSeconds =
    typeof offer.maxTimeoutSeconds === "number" && offer.maxTimeoutSeconds > 0
      ? BigInt(offer.maxTimeoutSeconds)
      : 300n;
  const payerAddress =
    (config.CUSTOMER_KITE_AA_PAYER_ADDRESS as `0x${string}` | undefined) ??
    (paymentWalletInfo.wallet.address as `0x${string}`);
  const amount = resolveGokiteAmount(offer);

  const authorization = {
    from: payerAddress,
    to: offer.payTo,
    token: offer.asset,
    value: amount,
    validAfter: (nowSeconds - 60n).toString(),
    validBefore: (nowSeconds + timeoutSeconds).toString(),
    nonce: hexlify(randomBytes(32)),
  };

  const signature = await agentWalletInfo.wallet.signTypedData(
    {
      name: "GokiteAccount",
      version: "1",
      chainId: BigInt(config.CUSTOMER_KITE_AA_CHAIN_ID),
      verifyingContract: payerAddress,
    },
    {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "token", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    {
      from: authorization.from,
      to: authorization.to,
      token: authorization.token,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    }
  );

  const payload: Record<string, unknown> = {
    authorization,
    signature,
    network: offer.network,
  };

  if (config.CUSTOMER_KITE_AA_SESSION_ID) {
    payload.sessionId = config.CUSTOMER_KITE_AA_SESSION_ID;
  }

  return Buffer.from(JSON.stringify(payload)).toString("base64");
};

type WalletEnvKey =
  | "CUSTOMER_AGENT_PRIVATE_KEY"
  | "CUSTOMER_SESSION_PRIVATE_KEY"
  | "CUSTOMER_PAYMENT_PRIVATE_KEY";

const walletFromEnv = (name: WalletEnvKey): { wallet: Wallet; generated: boolean } => {
  const privateKey = config[name];
  if (privateKey && privateKey.length > 0) {
    return { wallet: new Wallet(privateKey, provider), generated: false };
  }

  return { wallet: new Wallet(Wallet.createRandom().privateKey, provider), generated: true };
};

const agentWalletInfo = walletFromEnv("CUSTOMER_AGENT_PRIVATE_KEY");
const sessionWalletInfo = walletFromEnv("CUSTOMER_SESSION_PRIVATE_KEY");
const paymentWalletInfo = walletFromEnv("CUSTOMER_PAYMENT_PRIVATE_KEY");

const signedGatewayFetch = buildSignedGatewayFetch({
  agentAddress: agentWalletInfo.wallet.address as `0x${string}`,
  sessionAddress: sessionWalletInfo.wallet.address as `0x${string}`,
  sessionWallet: sessionWalletInfo.wallet,
});

const account = privateKeyToAccount(paymentWalletInfo.wallet.privateKey as `0x${string}`);
const paymentClient = new x402Client();
registerExactEvmScheme(paymentClient, {
  signer: toClientEvmSigner({
    ...account,
    // Exact scheme can avoid this on many flows, but the type requires it.
    readContract: async () => {
      throw new Error("readContract unavailable for this signer on current configuration");
    },
  }),
});
if (config.CUSTOMER_ENABLE_GOKITE_AA) {
  paymentClient.registerV1(
    config.CUSTOMER_KITE_AA_NETWORK,
    new GokiteAaSchemeClient({
      signer: paymentWalletInfo.wallet,
      chainId: BigInt(config.CUSTOMER_KITE_AA_CHAIN_ID),
      payerAddress: config.CUSTOMER_KITE_AA_PAYER_ADDRESS as `0x${string}` | undefined,
      sessionId: config.CUSTOMER_KITE_AA_SESSION_ID,
    })
  );
}
const gatewayFetchWithX402 = wrapFetchWithPayment(signedGatewayFetch, paymentClient);

const postGateway = async (input: {
  route: string;
  body: Record<string, unknown>;
  actionId: string;
  extraHeaders?: Record<string, string>;
}): Promise<{ response: Response; payload: unknown }> => {
  const response = await signedGatewayFetch(`${config.GATEWAY_BASE_URL}${input.route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [X_ACTION_ID_HEADER]: input.actionId,
      ...(input.extraHeaders ?? {}),
    },
    body: JSON.stringify(input.body),
  });

  const payload = await parseJsonSafe(response);
  return { response, payload };
};

const payDirectTransfer = async (challenge: PaymentChallenge): Promise<`0x${string}`> => {
  const token = new Contract(
    challenge.asset,
    ERC20_ABI,
    paymentWalletInfo.wallet.connect(provider)
  ) as unknown as {
    transfer: (
      to: string,
      value: bigint
    ) => Promise<{ hash: `0x${string}`; wait: () => Promise<{ status: number } | null> }>;
  };

  const tx = await token.transfer(challenge.payTo, BigInt(challenge.amountAtomic));
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("direct transfer reverted");
  }
  return tx.hash;
};

const isPrimarySettleable = (payload: unknown): boolean => {
  const paymentRequired = asPaymentRequired(payload);
  if (!paymentRequired) {
    return false;
  }
  return paymentRequired.accepts.some((offer) => supportsOffer(paymentRequired, offer));
};

const run = async () => {
  const primaryRequestBody =
    config.CUSTOMER_PRIMARY_ROUTE === "/api/x402-proxy"
      ? {
          upstreamUrl: config.CUSTOMER_PRIMARY_UPSTREAM_URL,
          method: config.CUSTOMER_PRIMARY_METHOD,
          query: { location: config.CUSTOMER_LOCATION },
        }
      : { location: config.CUSTOMER_LOCATION };
  const fallbackRequestBody = { location: config.CUSTOMER_LOCATION };

  console.log("[customer-agent] onboarding addresses");
  console.log(`owner will register these in web UI (agent/session only)`);
  console.log(`agent=${agentWalletInfo.wallet.address}`);
  console.log(`session=${sessionWalletInfo.wallet.address}`);
  console.log(`payer=${paymentWalletInfo.wallet.address}`);
  if (agentWalletInfo.generated || sessionWalletInfo.generated || paymentWalletInfo.generated) {
    console.log(
      "[customer-agent] one or more private keys were not set in env; generated ephemeral keys for this run."
    );
  }

  console.log(`[customer-agent] step=1 route=${config.CUSTOMER_PRIMARY_ROUTE} attempt=primary`);
  let primaryResponse: Response | null = null;
  let primaryPayload: unknown = null;
  let primaryError: Error | null = null;
  const primaryActionId = randomUUID();

  const canUseAutomaticX402 =
    config.CUSTOMER_ENABLE_X402_AUTOPAY && config.CUSTOMER_PRIMARY_ROUTE !== "/api/x402-proxy";

  if (canUseAutomaticX402) {
    try {
      primaryResponse = await gatewayFetchWithX402(`${config.GATEWAY_BASE_URL}${config.CUSTOMER_PRIMARY_ROUTE}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [X_ACTION_ID_HEADER]: primaryActionId,
        },
        body: JSON.stringify(primaryRequestBody),
      });
      primaryPayload = await parseJsonSafe(primaryResponse);
    } catch (error) {
      primaryError = error as Error;
    }
  } else {
    const primary = await postGateway({
      route: config.CUSTOMER_PRIMARY_ROUTE,
      body: primaryRequestBody,
      actionId: primaryActionId,
    });
    primaryResponse = primary.response;
    primaryPayload = primary.payload;
  }

  if (primaryError) {
    console.log(`[customer-agent] primary x402 settlement failed: ${shorten(primaryError.message)}`);
    const diagnostic = await postGateway({
      route: config.CUSTOMER_PRIMARY_ROUTE,
      body: primaryRequestBody,
      actionId: primaryActionId,
    });
    primaryResponse = diagnostic.response;
    primaryPayload = diagnostic.payload;
  }

  if (primaryResponse?.status === 402 && config.CUSTOMER_ENABLE_GOKITE_AA) {
    const paymentRequired = asPaymentRequired(primaryPayload);
    const gokiteOffer =
      paymentRequired?.accepts.find(
        (offer) => offer.scheme === "gokite-aa" && offer.network === config.CUSTOMER_KITE_AA_NETWORK
      ) ?? null;

    if (gokiteOffer) {
      try {
        const xPayment = await createLegacyGokiteXPayment(gokiteOffer as GokitePaymentOffer);
        const retryActionId = asString((primaryPayload as { actionId?: unknown } | null)?.actionId) ?? primaryActionId;
        const retry = await postGateway({
          route: config.CUSTOMER_PRIMARY_ROUTE,
          body: primaryRequestBody,
          actionId: retryActionId,
          extraHeaders: {
            [X_PAYMENT_HEADER]: xPayment,
          },
        });
        primaryResponse = retry.response;
        primaryPayload = retry.payload;
      } catch (error) {
        primaryError = error as Error;
      }
    }
  }

  if (primaryResponse?.ok) {
    console.log("[customer-agent] primary weather succeeded");
    console.log(JSON.stringify(primaryPayload, null, 2));
    return;
  }

  if (primaryResponse?.status === 402) {
    const directChallenge = parseChallenge(primaryResponse, primaryPayload);
    if (directChallenge) {
      console.log(
        `[customer-agent] primary direct challenge actionId=${directChallenge.actionId} payTo=${directChallenge.payTo} amount=${directChallenge.amountAtomic}`
      );
      const directTxHash = await payDirectTransfer(directChallenge);
      const primaryRetry = await postGateway({
        route: config.CUSTOMER_PRIMARY_ROUTE,
        body: primaryRequestBody,
        actionId: directChallenge.actionId,
        extraHeaders: {
          [X_TX_HASH_HEADER]: directTxHash,
        },
      });
      primaryResponse = primaryRetry.response;
      primaryPayload = primaryRetry.payload;
      if (primaryResponse.ok) {
        console.log("[customer-agent] primary weather succeeded");
        console.log(JSON.stringify(primaryPayload, null, 2));
        console.log(`[customer-agent] evidence txHash=${directTxHash}`);
        return;
      }
    }
  }

  if (primaryResponse?.status === 402) {
    console.log(`[customer-agent] primary 402 payload=${JSON.stringify(primaryPayload)}`);
    const paymentRequired = asPaymentRequired(primaryPayload);
    if (paymentRequired) {
      const options = summarizePaymentOptions(paymentRequired);
      if (isPrimarySettleable(primaryPayload)) {
        console.log(
          `[customer-agent] primary returned x402 challenge options=${options}; settlement did not complete, falling back.`
        );
      } else {
        console.log(
          `[customer-agent] primary returned unsupported x402 schemes for current adapters options=${options}; falling back.`
        );
      }
    } else {
      console.log("[customer-agent] primary returned 402 without parseable payment requirements; falling back.");
    }
  } else {
    const fallbackReason =
      primaryPayload && typeof primaryPayload === "object"
        ? JSON.stringify(primaryPayload)
        : String(primaryPayload);
    console.log(
      `[customer-agent] primary not usable status=${primaryResponse?.status ?? "unknown"} reason=${fallbackReason}; falling back.`
    );
  }

  console.log(`[customer-agent] step=2 route=${config.CUSTOMER_FALLBACK_ROUTE} attempt=fallback`);
  const firstFallback = await postGateway({
    route: config.CUSTOMER_FALLBACK_ROUTE,
    body: fallbackRequestBody,
    actionId: randomUUID(),
  });

  if (firstFallback.response.status !== 402) {
    throw new Error(
      `fallback route expected 402, got ${firstFallback.response.status}: ${JSON.stringify(firstFallback.payload)}`
    );
  }

  const challenge = parseChallenge(firstFallback.response, firstFallback.payload);
  if (!challenge) {
    throw new Error("fallback route returned 402 without parseable challenge");
  }

  console.log(
    `[customer-agent] challenge actionId=${challenge.actionId} payTo=${challenge.payTo} amount=${challenge.amountAtomic}`
  );

  const txHash = await payDirectTransfer(challenge);
  console.log(`[customer-agent] paid fallback challenge txHash=${txHash}`);

  const secondFallback = await postGateway({
    route: config.CUSTOMER_FALLBACK_ROUTE,
    body: fallbackRequestBody,
    actionId: challenge.actionId,
    extraHeaders: {
      [X_TX_HASH_HEADER]: txHash,
    },
  });

  if (!secondFallback.response.ok) {
    throw new Error(
      `fallback retry failed status=${secondFallback.response.status}: ${JSON.stringify(secondFallback.payload)}`
    );
  }

  console.log("[customer-agent] fallback weather succeeded");
  console.log(JSON.stringify(secondFallback.payload, null, 2));
  const actionId = asString((secondFallback.payload as { actionId?: unknown })?.actionId);
  if (actionId) {
    console.log(`[customer-agent] evidence actionId=${actionId}`);
  }
  console.log(`[customer-agent] evidence txHash=${txHash}`);
};

run().catch((error) => {
  console.error(`[customer-agent] failed: ${(error as Error).message}`);
  process.exit(1);
});
