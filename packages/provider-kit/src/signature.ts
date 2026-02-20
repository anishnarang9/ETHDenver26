import { keccak256, toUtf8Bytes, verifyMessage } from "ethers";
import type { FastifyRequest } from "fastify";
import type { SignedRequestEnvelope } from "@kite-stack/shared-types";
import type { SignatureVerifier } from "./types.js";

const stableSerialize = (value: unknown): string => JSON.stringify(value ?? {});

const canonicalMessage = (envelope: SignedRequestEnvelope): string =>
  [
    envelope.agentAddress,
    envelope.sessionAddress,
    envelope.timestamp,
    envelope.nonce,
    envelope.bodyHash,
  ].join("|");

export class DefaultSignatureVerifier implements SignatureVerifier {
  async verify(envelope: SignedRequestEnvelope, request: FastifyRequest): Promise<boolean> {
    const bodyString = stableSerialize(request.body);
    const computedBodyHash = keccak256(toUtf8Bytes(bodyString));

    if (computedBodyHash.toLowerCase() !== envelope.bodyHash.toLowerCase()) {
      return false;
    }

    try {
      const recovered = verifyMessage(canonicalMessage(envelope), envelope.signature);
      return recovered.toLowerCase() === envelope.sessionAddress.toLowerCase();
    } catch {
      return false;
    }
  }
}
