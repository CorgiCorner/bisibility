ALTER TABLE metering_paid_attempt_context
  ADD COLUMN submission_completed_at TIMESTAMPTZ,
  ADD COLUMN completion_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN ownership_superseded_at TIMESTAMPTZ;

CREATE TABLE provider_recovery_candidates (
  "namespace" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "id" TEXT NOT NULL PRIMARY KEY,
  "operationPk" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "rankCheckId" TEXT NOT NULL,
  "queuedTaskId" TEXT,
  "stopReason" TEXT,
  "pollingStoppedAt" TIMESTAMP(3),
  "accountingOnly" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "provider_recovery_candidates_operationPk_attemptId_key"
  ON provider_recovery_candidates ("operationPk", "attemptId");
CREATE INDEX "provider_recovery_candidates_rankCheckId_idx" ON provider_recovery_candidates ("rankCheckId");

CREATE TABLE provider_recovery_intents (
  "id" TEXT NOT NULL PRIMARY KEY,
  "candidateId" TEXT NOT NULL,
  "operationPk" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "state" "ProviderRecoveryState" NOT NULL DEFAULT 'scheduled',
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "reason" TEXT,
  "accountingOnly" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "provider_recovery_intents_candidateId_fkey" FOREIGN KEY ("candidateId")
    REFERENCES provider_recovery_candidates ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "provider_recovery_intents_candidateId_key" ON provider_recovery_intents ("candidateId");
CREATE UNIQUE INDEX "provider_recovery_intents_operationPk_attemptId_key"
  ON provider_recovery_intents ("operationPk", "attemptId");
CREATE INDEX "provider_recovery_intents_state_nextAttemptAt_idx" ON provider_recovery_intents ("state", "nextAttemptAt");
