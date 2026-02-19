import {
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  X_ACTION_ID_HEADER,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  X_TX_HASH_HEADER,
  type PaymentChallenge,
  type PaymentProof,
  type SignedRequestEnvelope,
} from "@kite-stack/shared-types";

export const HEADER_AGENT = "x-agent-address";
export const HEADER_SESSION = "x-session-address";
export const HEADER_TIMESTAMP = "x-timestamp";
export const HEADER_NONCE = "x-nonce";
export const HEADER_BODY_HASH = "x-body-hash";
export const HEADER_SIGNATURE = "x-signature";

const asString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
};

export const readEnvelope = (headers: Record<string, unknown>): SignedRequestEnvelope | null => {
  const agentAddress = asString(headers[HEADER_AGENT]);
  const sessionAddress = asString(headers[HEADER_SESSION]);
  const timestamp = asString(headers[HEADER_TIMESTAMP]);
  const nonce = asString(headers[HEADER_NONCE]);
  const bodyHash = asString(headers[HEADER_BODY_HASH]);
  const signature = asString(headers[HEADER_SIGNATURE]);

  if (!agentAddress || !sessionAddress || !timestamp || !nonce || !bodyHash || !signature) {
    return null;
  }

  return {
    agentAddress: agentAddress as `0x${string}`,
    sessionAddress: sessionAddress as `0x${string}`,
    timestamp,
    nonce,
    bodyHash,
    signature,
  };
};

export const readPaymentProof = (headers: Record<string, unknown>): PaymentProof | null => {
  const legacy = asString(headers[X_PAYMENT_HEADER.toLowerCase()]);
  const v2 = asString(headers[PAYMENT_SIGNATURE_HEADER.toLowerCase()]);
  const txHash = asString(headers[X_TX_HASH_HEADER.toLowerCase()]);
  const actionId = asString(headers[X_ACTION_ID_HEADER.toLowerCase()]);

  if (legacy && actionId) {
    return {
      actionId,
      signature: legacy,
      txHash: txHash as `0x${string}` | undefined,
      protocol: "x-payment",
    };
  }

  if (v2 && actionId) {
    return {
      actionId,
      signature: v2,
      txHash: txHash as `0x${string}` | undefined,
      protocol: "payment-signature",
    };
  }

  if (txHash && actionId) {
    return {
      actionId,
      txHash: txHash as `0x${string}`,
      protocol: "direct-transfer",
    };
  }

  return null;
};

export const buildChallengeHeaders = (challenge: PaymentChallenge): Record<string, string> => {
  const payload = JSON.stringify(challenge);

  return {
    [PAYMENT_REQUIRED_HEADER]: payload,
    [X_PAYMENT_RESPONSE_HEADER]: payload,
    [PAYMENT_RESPONSE_HEADER]: payload,
    [X_ACTION_ID_HEADER]: challenge.actionId,
  };
};
