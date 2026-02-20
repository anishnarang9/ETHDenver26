import { describe, expect, it } from "vitest";
import { Wallet, keccak256, toUtf8Bytes } from "ethers";
import { DefaultSignatureVerifier } from "../src/signature.js";

const buildRequest = (body: unknown) => ({ body } as any);

describe("DefaultSignatureVerifier", () => {
  it("verifies signature for canonical message", async () => {
    const wallet = Wallet.createRandom();
    const body = { hello: "world" };
    const bodyHash = keccak256(toUtf8Bytes(JSON.stringify(body)));
    const envelope = {
      agentAddress: Wallet.createRandom().address as `0x${string}`,
      sessionAddress: wallet.address as `0x${string}`,
      timestamp: new Date().toISOString(),
      nonce: "n-1",
      bodyHash,
      signature: "",
    };
    const message = [
      envelope.agentAddress,
      envelope.sessionAddress,
      envelope.timestamp,
      envelope.nonce,
      envelope.bodyHash,
    ].join("|");
    envelope.signature = await wallet.signMessage(message);

    const verifier = new DefaultSignatureVerifier();
    const valid = await verifier.verify(envelope, buildRequest(body));

    expect(valid).toBe(true);
  });

  it("rejects mismatched body hash", async () => {
    const wallet = Wallet.createRandom();
    const body = { hello: "world" };
    const envelope = {
      agentAddress: Wallet.createRandom().address as `0x${string}`,
      sessionAddress: wallet.address as `0x${string}`,
      timestamp: new Date().toISOString(),
      nonce: "n-1",
      bodyHash: "0xdeadbeef",
      signature: "",
    };
    const message = [
      envelope.agentAddress,
      envelope.sessionAddress,
      envelope.timestamp,
      envelope.nonce,
      envelope.bodyHash,
    ].join("|");
    envelope.signature = await wallet.signMessage(message);

    const verifier = new DefaultSignatureVerifier();
    const valid = await verifier.verify(envelope, buildRequest(body));

    expect(valid).toBe(false);
  });

  it("rejects malformed signatures without throwing", async () => {
    const body = { hello: "world" };
    const envelope = {
      agentAddress: Wallet.createRandom().address as `0x${string}`,
      sessionAddress: Wallet.createRandom().address as `0x${string}`,
      timestamp: new Date().toISOString(),
      nonce: "n-1",
      bodyHash: keccak256(toUtf8Bytes(JSON.stringify(body))),
      signature: "not-a-signature",
    };

    const verifier = new DefaultSignatureVerifier();
    const valid = await verifier.verify(envelope, buildRequest(body));

    expect(valid).toBe(false);
  });
});
