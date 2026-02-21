-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "agentAddress" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassportSnapshot" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "onchainVersion" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "perCallCap" DECIMAL(78,0) NOT NULL,
    "dailyCap" DECIMAL(78,0) NOT NULL,
    "rateLimitPerMin" INTEGER NOT NULL,
    "scopesJson" JSONB NOT NULL,
    "servicesJson" JSONB NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionAddress" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "scopeSubsetJson" JSONB NOT NULL,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionAttempt" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "quoteExpiresAt" TIMESTAMP(3),
    "quoteAmount" DECIMAL(78,0),
    "quoteAsset" TEXT,
    "protocolMode" TEXT NOT NULL DEFAULT 'dual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentQuote" (
    "id" TEXT NOT NULL,
    "actionAttemptId" TEXT NOT NULL,
    "payTo" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "asset" TEXT NOT NULL,
    "facilitatorUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSettlement" (
    "id" TEXT NOT NULL,
    "actionAttemptId" TEXT NOT NULL,
    "txHash" TEXT,
    "settlementRef" TEXT,
    "payer" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "asset" TEXT NOT NULL,
    "verificationMode" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "routeId" TEXT NOT NULL,
    "paymentRef" TEXT NOT NULL,
    "metadataHash" TEXT NOT NULL,
    "onchainTxHash" TEXT,
    "onchainReceiptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnforcementEvent" (
    "id" TEXT NOT NULL,
    "actionAttemptId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "agentAddress" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "detailsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnforcementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nonce" (
    "id" TEXT NOT NULL,
    "sessionAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_agentAddress_key" ON "Agent"("agentAddress");

-- CreateIndex
CREATE INDEX "PassportSnapshot_agentId_createdAt_idx" ON "PassportSnapshot"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionAddress_key" ON "Session"("sessionAddress");

-- CreateIndex
CREATE INDEX "Session_agentId_expiresAt_idx" ON "Session"("agentId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActionAttempt_actionId_key" ON "ActionAttempt"("actionId");

-- CreateIndex
CREATE INDEX "ActionAttempt_agentId_routeId_createdAt_idx" ON "ActionAttempt"("agentId", "routeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentQuote_actionAttemptId_key" ON "PaymentQuote"("actionAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSettlement_actionAttemptId_key" ON "PaymentSettlement"("actionAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSettlement_txHash_key" ON "PaymentSettlement"("txHash");

-- CreateIndex
CREATE INDEX "Receipt_agentId_createdAt_idx" ON "Receipt"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_actionId_paymentRef_key" ON "Receipt"("actionId", "paymentRef");

-- CreateIndex
CREATE INDEX "EnforcementEvent_agentAddress_createdAt_idx" ON "EnforcementEvent"("agentAddress", "createdAt");

-- CreateIndex
CREATE INDEX "EnforcementEvent_actionId_createdAt_idx" ON "EnforcementEvent"("actionId", "createdAt");

-- CreateIndex
CREATE INDEX "Nonce_sessionAddress_usedAt_idx" ON "Nonce"("sessionAddress", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Nonce_sessionAddress_nonce_key" ON "Nonce"("sessionAddress", "nonce");

-- AddForeignKey
ALTER TABLE "PassportSnapshot" ADD CONSTRAINT "PassportSnapshot_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionAttempt" ADD CONSTRAINT "ActionAttempt_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentQuote" ADD CONSTRAINT "PaymentQuote_actionAttemptId_fkey" FOREIGN KEY ("actionAttemptId") REFERENCES "ActionAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSettlement" ADD CONSTRAINT "PaymentSettlement_actionAttemptId_fkey" FOREIGN KEY ("actionAttemptId") REFERENCES "ActionAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnforcementEvent" ADD CONSTRAINT "EnforcementEvent_actionAttemptId_fkey" FOREIGN KEY ("actionAttemptId") REFERENCES "ActionAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
