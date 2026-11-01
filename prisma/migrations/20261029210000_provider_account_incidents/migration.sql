-- AlterTable
ALTER TABLE "provider_connection_recovery" ADD COLUMN     "cadenceAttempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentIncidentId" TEXT,
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "leaseOwner" TEXT,
ADD COLUMN     "nextCheckAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "provider_account_incidents" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "credentialVersion" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceSource" TEXT NOT NULL,
    "minimumCapacity" DOUBLE PRECISION,
    "capacityUnit" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "provider_account_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_blocked_attempts" (
    "id" TEXT NOT NULL,
    "rankCheckId" TEXT NOT NULL,
    "runItemId" TEXT,
    "connectionId" TEXT NOT NULL,
    "credentialVersion" TEXT NOT NULL,
    "incidentId" TEXT,
    "refusalKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "transportPhase" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_blocked_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_account_incidents_connectionId_startedAt_idx" ON "provider_account_incidents"("connectionId", "startedAt");

-- CreateIndex
CREATE INDEX "provider_blocked_attempts_connectionId_createdAt_idx" ON "provider_blocked_attempts"("connectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "provider_blocked_attempts_rankCheckId_connectionId_refusalK_key" ON "provider_blocked_attempts"("rankCheckId", "connectionId", "refusalKey");

-- CreateIndex
CREATE UNIQUE INDEX "provider_connection_recovery_currentIncidentId_key" ON "provider_connection_recovery"("currentIncidentId");

-- AddForeignKey
ALTER TABLE "provider_connection_recovery" ADD CONSTRAINT "provider_connection_recovery_currentIncidentId_fkey" FOREIGN KEY ("currentIncidentId") REFERENCES "provider_account_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_account_incidents" ADD CONSTRAINT "provider_account_incidents_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_blocked_attempts" ADD CONSTRAINT "provider_blocked_attempts_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_blocked_attempts" ADD CONSTRAINT "provider_blocked_attempts_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "provider_account_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
