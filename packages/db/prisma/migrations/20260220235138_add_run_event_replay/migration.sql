-- CreateTable
CREATE TABLE "RunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "offsetMs" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunEvent_runId_offsetMs_idx" ON "RunEvent"("runId", "offsetMs");
