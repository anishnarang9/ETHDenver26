import { createHash, randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { EnforcementEventType } from "@kite-stack/shared-types";
import { EnforcementError } from "./errors.js";
import { buildChallengeHeaders, readEnvelope, readPaymentProof } from "./headers.js";
import type { EnforcementOptions, RouteEnforcer } from "./types.js";

const toScopeHash = (scope: string): string => scope;
const toServiceHash = (service: string): string => service;

const emit = async (
  options: EnforcementOptions,
  actionId: string,
  agentAddress: `0x${string}`,
  routeId: string,
  eventType: EnforcementEventType,
  details: Record<string, string | number | boolean | null>
) => {
  await options.eventSink.write({
    actionId,
    agentAddress,
    routeId,
    eventType,
    details,
    createdAt: (options.now?.() ?? new Date()).toISOString(),
  });
};

const fail = async (
  options: EnforcementOptions,
  actionId: string,
  agentAddress: `0x${string}`,
  routeId: string,
  statusCode: number,
  code:
    | "INVALID_SIGNATURE"
    | "SESSION_REVOKED"
    | "SESSION_EXPIRED"
    | "PASSPORT_REVOKED"
    | "PASSPORT_EXPIRED"
    | "SCOPE_FORBIDDEN"
    | "SERVICE_FORBIDDEN"
    | "RATE_LIMITED"
    | "DAILY_BUDGET_EXCEEDED"
    | "PER_CALL_BUDGET_EXCEEDED"
    | "REPLAY_NONCE"
    | "PAYMENT_REQUIRED"
    | "PAYMENT_INVALID",
  message: string
): Promise<never> => {
  await emit(options, actionId, agentAddress, routeId, "REQUEST_BLOCKED", { code, message, statusCode });
  throw new EnforcementError(statusCode, code, message, actionId, routeId);
};

const safeAgent = (request: FastifyRequest): `0x${string}` => {
  const fallback = "0x0000000000000000000000000000000000000000" as `0x${string}`;
  const raw = request.headers["x-agent-address"];
  if (typeof raw !== "string") {
    return fallback;
  }
  return raw as `0x${string}`;
};

export const createRouteEnforcer = (options: EnforcementOptions): RouteEnforcer => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const actionId =
      (typeof request.headers["x-action-id"] === "string" && request.headers["x-action-id"]) || randomUUID();
    const routeConfig = request.routeOptions.config as unknown as Record<string, unknown> | undefined;
    const routeId =
      options.routeIdResolver?.(request) ||
      (typeof routeConfig?.routeId === "string" ? String(routeConfig.routeId) : "");

    const routePolicy = options.routePolicies[routeId];
    if (!routePolicy) {
      throw new Error(`Missing route policy for routeId ${routeId}`);
    }

    const maybeEnvelope = readEnvelope(request.headers as Record<string, unknown>);
    const agentAddress = maybeEnvelope?.agentAddress || safeAgent(request);

    if (!maybeEnvelope) {
      await fail(options, actionId, agentAddress, routeId, 401, "INVALID_SIGNATURE", "missing signed envelope headers");
    }
    const envelope = maybeEnvelope as NonNullable<typeof maybeEnvelope>;

    const signatureOk = await options.signatureVerifier.verify(envelope, request);
    if (!signatureOk) {
      await fail(options, actionId, envelope.agentAddress, routeId, 401, "INVALID_SIGNATURE", "invalid request signature");
    }
    await emit(options, actionId, envelope.agentAddress, routeId, "IDENTITY_VERIFIED", {});

    const nonceOk = await options.nonceStore.use(envelope.sessionAddress, envelope.nonce);
    if (!nonceOk) {
      await fail(options, actionId, envelope.agentAddress, routeId, 409, "REPLAY_NONCE", "nonce already used");
    }

    const sessionActive = await options.sessionClient.isSessionActive(envelope.sessionAddress);
    if (!sessionActive) {
      await fail(options, actionId, envelope.agentAddress, routeId, 401, "SESSION_EXPIRED", "session is inactive");
    }

    const session = await options.sessionClient.getSession(envelope.sessionAddress);
    if (!session || session.revoked) {
      await fail(options, actionId, envelope.agentAddress, routeId, 401, "SESSION_REVOKED", "session revoked");
    }
    const activeSession = session as NonNullable<typeof session>;

    if (activeSession.agent.toLowerCase() !== envelope.agentAddress.toLowerCase()) {
      await fail(options, actionId, envelope.agentAddress, routeId, 401, "INVALID_SIGNATURE", "session agent mismatch");
    }
    await emit(options, actionId, envelope.agentAddress, routeId, "SESSION_VERIFIED", {});

    const passport = await options.passportClient.getPassport(envelope.agentAddress);
    if (!passport || passport.revoked) {
      await fail(options, actionId, envelope.agentAddress, routeId, 403, "PASSPORT_REVOKED", "passport is revoked or missing");
    }
    const activePassport = passport as NonNullable<typeof passport>;

    const nowSec = Math.floor((options.now?.().getTime() ?? Date.now()) / 1000);
    if (activePassport.expiresAt <= nowSec) {
      await fail(options, actionId, envelope.agentAddress, routeId, 403, "PASSPORT_EXPIRED", "passport expired");
    }
    await emit(options, actionId, envelope.agentAddress, routeId, "PASSPORT_VERIFIED", {});

    const scopeAllowedBySession = await options.sessionClient.hasScope(envelope.sessionAddress, routePolicy.scope);
    const scopeAllowedByPassport = await options.passportClient.isScopeAllowed(
      envelope.agentAddress,
      toScopeHash(routePolicy.scope)
    );
    if (!scopeAllowedBySession || !scopeAllowedByPassport) {
      await fail(options, actionId, envelope.agentAddress, routeId, 403, "SCOPE_FORBIDDEN", "scope is not allowed");
    }
    await emit(options, actionId, envelope.agentAddress, routeId, "SCOPE_VERIFIED", { scope: routePolicy.scope });

    const serviceAllowed = await options.passportClient.isServiceAllowed(
      envelope.agentAddress,
      toServiceHash(routePolicy.service)
    );
    if (!serviceAllowed) {
      await fail(options, actionId, envelope.agentAddress, routeId, 403, "SERVICE_FORBIDDEN", "service not approved");
    }
    await emit(options, actionId, envelope.agentAddress, routeId, "SERVICE_VERIFIED", { service: routePolicy.service });

    const rateKey = `${envelope.agentAddress.toLowerCase()}:${routePolicy.routeId}`;
    const rateAllowed = await options.rateLimiter.allow(rateKey, routePolicy.rateLimitPerMin);
    if (!rateAllowed) {
      await fail(options, actionId, envelope.agentAddress, routeId, 429, "RATE_LIMITED", "rate limit exceeded");
    }
    await emit(options, actionId, envelope.agentAddress, routeId, "RATE_LIMIT_VERIFIED", { max: routePolicy.rateLimitPerMin });

    if (BigInt(routePolicy.priceAtomic) > activePassport.perCallCap) {
      await fail(options, actionId, envelope.agentAddress, routeId, 403, "PER_CALL_BUDGET_EXCEEDED", "per-call cap exceeded");
    }

    const canSpend = await options.budgetService.canSpend(
      envelope.agentAddress,
      BigInt(routePolicy.priceAtomic),
      activePassport.dailyCap
    );
    if (!canSpend) {
      await fail(options, actionId, envelope.agentAddress, routeId, 403, "DAILY_BUDGET_EXCEEDED", "daily cap exceeded");
    }
    await emit(options, actionId, envelope.agentAddress, routeId, "BUDGET_VERIFIED", {});

    if (!routePolicy.requirePayment) {
      request.enforcementContext = { actionId, routePolicy };
      return;
    }

    const proof = readPaymentProof(request.headers as Record<string, unknown>);
    let quote = await options.quoteStore.get(actionId);

    if (!proof) {
      quote =
        quote ||
        (await options.paymentService.buildQuote({
          actionId,
          routePolicy,
          payTo: options.defaultPayTo,
          asset: options.defaultAsset,
        }));

      await options.quoteStore.save(actionId, quote, routeId, envelope.agentAddress);
      await emit(options, actionId, envelope.agentAddress, routeId, "QUOTE_ISSUED", {
        amountAtomic: quote.amountAtomic,
        asset: quote.asset,
      });

      const headers = buildChallengeHeaders(quote);
      for (const [key, value] of Object.entries(headers)) {
        reply.header(key, value);
      }

      reply.status(402).send({
        error: "PAYMENT_REQUIRED",
        message: "Complete payment and retry with proof",
        challenge: quote,
      });

      throw new EnforcementError(402, "PAYMENT_REQUIRED", "payment required", actionId, routeId);
    }
    const paymentProof = proof as NonNullable<typeof proof>;

    if (!quote) {
      quote = await options.paymentService.buildQuote({
        actionId,
        routePolicy,
        payTo: options.defaultPayTo,
        asset: options.defaultAsset,
      });
      await options.quoteStore.save(actionId, quote, routeId, envelope.agentAddress);
    }
    const activeQuote = quote as NonNullable<typeof quote>;

    if (new Date(activeQuote.expiresAt).getTime() <= (options.now?.().getTime() ?? Date.now())) {
      await fail(options, actionId, envelope.agentAddress, routeId, 402, "PAYMENT_INVALID", "payment quote expired");
    }

    const verification = await options.paymentService.verifyPayment({
      challenge: activeQuote,
      proof: paymentProof,
      agentAddress: envelope.agentAddress,
    });

    if (!verification.verified) {
      await fail(options, actionId, envelope.agentAddress, routeId, 402, "PAYMENT_INVALID", verification.reason || "invalid payment");
    }

    await options.quoteStore.markSettled(actionId, verification.settlementRef, verification.txHash);
    await emit(options, actionId, envelope.agentAddress, routeId, "PAYMENT_VERIFIED", {
      settlementRef: verification.settlementRef,
      txHash: verification.txHash ?? null,
      mode: verification.mode,
    });

    const metadataHash = createHash("sha256")
      .update(JSON.stringify({ routeId, body: request.body ?? null, settledAt: Date.now() }))
      .digest("hex");

    const receipt = await options.receiptWriter.record({
      actionId,
      agent: envelope.agentAddress,
      payer: verification.payer,
      amountAtomic: verification.amountAtomic,
      asset: activeQuote.asset,
      routeId,
      paymentRef: verification.settlementRef,
      metadataHash,
      txHash: verification.txHash,
    });

    await emit(options, actionId, envelope.agentAddress, routeId, "RECEIPT_RECORDED", {
      paymentRef: verification.settlementRef,
      onchainReceiptId: receipt.onchainReceiptId ?? null,
      onchainTxHash: receipt.onchainTxHash ?? null,
    });

    request.enforcementContext = {
      actionId,
      routePolicy,
      challenge: activeQuote,
    };
  };
};

export const enforcementErrorHandler = async (
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  if (error instanceof EnforcementError) {
    if (!reply.sent) {
      reply.status(error.statusCode).send(error.payload);
    }
    return;
  }

  request.log.error({ err: error }, "Unhandled enforcement error");
  if (!reply.sent) {
    reply.status(500).send({
      code: "PAYMENT_INVALID",
      message: "unexpected server error",
    });
  }
};
