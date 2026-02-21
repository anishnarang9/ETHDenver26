import { afterEach, describe, expect, it } from "vitest";
import { onchainTestUtils } from "../src/lib/onchain";

describe("web onchain helpers", () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  const originalExplorer = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window?: unknown }).window = originalWindow;
    }
    process.env.NEXT_PUBLIC_EXPLORER_BASE_URL = originalExplorer;
  });

  it("throws when wallet provider is missing", () => {
    (globalThis as unknown as { window?: unknown }).window = {};
    expect(() => onchainTestUtils.getEthereum()).toThrow("No EVM wallet found");
  });

  it("throws on wrong chain id", () => {
    expect(() => onchainTestUtils.assertExpectedChain("2368", 1n)).toThrow("Wrong network in wallet");
  });

  it("throws when contract env address is missing", () => {
    expect(() =>
      onchainTestUtils.getRequiredAddress(undefined, "NEXT_PUBLIC_PASSPORT_REGISTRY_ADDRESS")
    ).toThrow("NEXT_PUBLIC_PASSPORT_REGISTRY_ADDRESS is missing");
  });

  it("builds explorer link consistently", () => {
    process.env.NEXT_PUBLIC_EXPLORER_BASE_URL = "https://testnet.kitescan.ai/";
    const link = onchainTestUtils.buildExplorerLink(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    expect(link).toBe(
      "https://testnet.kitescan.ai/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
  });
});
