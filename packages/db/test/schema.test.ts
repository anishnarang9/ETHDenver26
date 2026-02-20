import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Prisma schema coverage", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

  it("contains all required core models", () => {
    const models = [
      "model Agent",
      "model PassportSnapshot",
      "model Session",
      "model ActionAttempt",
      "model PaymentQuote",
      "model PaymentSettlement",
      "model Receipt",
      "model EnforcementEvent",
      "model Nonce",
    ];

    for (const marker of models) {
      expect(schema).toContain(marker);
    }
  });

  it("enforces action and nonce uniqueness", () => {
    expect(schema).toContain("actionId         String             @unique");
    expect(schema).toContain("@@unique([sessionAddress, nonce])");
    expect(schema).toContain("txHash           String?  @unique");
    expect(schema).toContain("@@unique([actionId, paymentRef])");
  });

  it("keeps timeline query indexes", () => {
    expect(schema).toContain("@@index([agentAddress, createdAt])");
    expect(schema).toContain("@@index([actionId, createdAt])");
    expect(schema).toContain("@@index([agentId, createdAt])");
  });

  it("includes settlement and receipt fields needed for spend and audit reports", () => {
    expect(schema).toContain("model PaymentSettlement");
    expect(schema).toContain("payer            String");
    expect(schema).toContain("amount           Decimal");
    expect(schema).toContain("verifiedAt       DateTime");
    expect(schema).toContain("model Receipt");
    expect(schema).toContain("onchainTxHash    String?");
    expect(schema).toContain("onchainReceiptId String?");
  });
});
