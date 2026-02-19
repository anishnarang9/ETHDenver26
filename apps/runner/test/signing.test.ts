import { describe, expect, it } from "vitest";
import { verifyMessage, Wallet } from "ethers";
import { buildBodyHash, buildCanonicalMessage, signEnvelope } from "../src/signing.js";

describe("runner signing helpers", () => {
  it("builds deterministic body hashes", () => {
    const body = { foo: "bar", n: 1 };
    const first = buildBodyHash(body);
    const second = buildBodyHash(body);

    expect(first).toEqual(second);
    expect(first.startsWith("0x")).toBe(true);
  });

  it("signs the canonical envelope with the session key", async () => {
    const sessionWallet = Wallet.createRandom();
    const envelope = {
      agentAddress: Wallet.createRandom().address as `0x${string}`,
      sessionAddress: sessionWallet.address as `0x${string}`,
      timestamp: new Date().toISOString(),
      nonce: "n-1",
      bodyHash: buildBodyHash({ hello: "world" }),
    };

    const signature = await signEnvelope({
      ...envelope,
      sessionWallet,
    });

    const recovered = verifyMessage(buildCanonicalMessage(envelope), signature);
    expect(recovered.toLowerCase()).toEqual(sessionWallet.address.toLowerCase());
  });
});
