-- CreateTable
CREATE TABLE "assistant_conversations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "activeRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "runId" TEXT,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_runs" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "funding" TEXT NOT NULL,
    "credentialId" TEXT,
    "credentialVersion" TEXT,
    "grantId" TEXT,
    "requestId" TEXT NOT NULL,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" DECIMAL(38,0),
    "costCertainty" TEXT NOT NULL DEFAULT 'unknown',
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "assistant_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_attempts" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "providerRequestId" TEXT,
    "status" TEXT NOT NULL,
    "reservedMicroUsd" DECIMAL(38,0) NOT NULL,
    "settledMicroUsd" DECIMAL(38,0),
    "usage" JSONB,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_tool_calls" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "argsHash" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "maxCostCents" INTEGER,
    "estimatedCostCents" INTEGER,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "versionHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "monthlyLimitMicroUsd" DECIMAL(38,0),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "limitMicroUsd" DECIMAL(38,0) NOT NULL,
    "requestLimit" INTEGER NOT NULL,
    "allowedModels" JSONB NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_conversations_activeRunId_key" ON "assistant_conversations"("activeRunId");

-- CreateIndex
CREATE INDEX "assistant_conversations_projectId_userId_updatedAt_idx" ON "assistant_conversations"("projectId", "userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_messages_conversationId_seq_key" ON "assistant_messages"("conversationId", "seq");

-- CreateIndex
CREATE INDEX "assistant_runs_projectId_userId_createdAt_idx" ON "assistant_runs"("projectId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_runs_conversationId_requestId_key" ON "assistant_runs"("conversationId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_attempts_operationId_key" ON "assistant_attempts"("operationId");

-- CreateIndex
CREATE INDEX "assistant_attempts_status_createdAt_idx" ON "assistant_attempts"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_attempts_runId_step_key" ON "assistant_attempts"("runId", "step");

-- CreateIndex
CREATE INDEX "assistant_tool_calls_runId_status_idx" ON "assistant_tool_calls"("runId", "status");

-- CreateIndex
CREATE INDEX "assistant_tool_calls_conversationId_status_idx" ON "assistant_tool_calls"("conversationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_credentials_userId_provider_key" ON "assistant_credentials"("userId", "provider");

-- CreateIndex
CREATE INDEX "assistant_grants_userId_startsAt_expiresAt_idx" ON "assistant_grants"("userId", "startsAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_attempts" ADD CONSTRAINT "assistant_attempts_runId_fkey" FOREIGN KEY ("runId") REFERENCES "assistant_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_tool_calls" ADD CONSTRAINT "assistant_tool_calls_runId_fkey" FOREIGN KEY ("runId") REFERENCES "assistant_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

