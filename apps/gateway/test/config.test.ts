import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";

const baseEnv = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/kite",
  KITE_RPC_URL: "http://localhost:8545",
  PASSPORT_REGISTRY_ADDRESS: "0x0000000000000000000000000000000000000001",
  SESSION_REGISTRY_ADDRESS: "0x0000000000000000000000000000000000000002",
  RECEIPT_LOG_ADDRESS: "0x0000000000000000000000000000000000000003",
  GATEWAY_SIGNER_PRIVATE_KEY: "0xabc",
  PAYMENT_RECIPIENT: "0x0000000000000000000000000000000000000004",
  PAYMENT_ASSET: "0x0000000000000000000000000000000000000005",
};

describe("gateway config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses required environment variables", () => {
    for (const [key, value] of Object.entries(baseEnv)) {
      vi.stubEnv(key, value);
    }

    const config = loadConfig();
    expect(config.GATEWAY_PORT).toBe("4001");
    expect(config.GATEWAY_HOST).toBe("0.0.0.0");
    expect(config.KITE_RPC_URL).toBe(baseEnv.KITE_RPC_URL);
  });

  it("throws when required values are missing", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("KITE_RPC_URL", "");

    expect(() => loadConfig()).toThrow();
  });
});
