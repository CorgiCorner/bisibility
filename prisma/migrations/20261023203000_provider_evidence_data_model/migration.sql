-- CreateEnum
CREATE TYPE "ProviderAcceptance" AS ENUM ('accepted', 'unconfirmed', 'rejected');

-- CreateEnum
CREATE TYPE "ProviderFulfillment" AS ENUM ('complete', 'partial', 'provider_error', 'pending', 'absent');

-- CreateEnum
CREATE TYPE "ProviderAccounting" AS ENUM ('measured', 'unknown', 'conflict');

-- CreateEnum
CREATE TYPE "ProviderAccountingExhaustion" AS ENUM ('pending', 'exhausted', 'not_applicable');

-- CreateEnum
CREATE TYPE "ProviderRecoveryState" AS ENUM ('not_needed', 'waiting_for_attempt_end', 'scheduled', 'attempting', 'resolved', 'operator_review');

-- CreateEnum
CREATE TYPE "CheckNotificationSetting" AS ENUM ('all', 'important', 'none');

-- CreateEnum
CREATE TYPE "ProviderIncidentState" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "ProviderIncidentTransitionKind" AS ENUM ('linked', 'count_change', 'resolved', 'reopened');

-- CreateEnum
CREATE TYPE "ProviderPartialEvidenceKind" AS ENUM ('partial', 'unresolved');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'provider_incident';
ALTER TYPE "NotificationType" ADD VALUE 'manual_run_summary';
ALTER TYPE "NotificationType" ADD VALUE 'scheduled_window_summary';


-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN     "checkNotificationPositionMove" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "checkNotificationSetting" "CheckNotificationSetting" NOT NULL DEFAULT 'important',
ADD COLUMN     "checkNotificationTopN" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "providerIncidentInApp" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "rank_checks" ADD COLUMN     "preRecoveryFinishedAt" TIMESTAMP(3),
ADD COLUMN     "recoveryProvenance" JSONB;

-- CreateTable
CREATE TABLE "provider_operation_evidence" (
    "operationPk" TEXT NOT NULL,
    "acceptance" "ProviderAcceptance",
    "fulfillment" "ProviderFulfillment",
    "returnedDepth" INTEGER,
    "accounting" "ProviderAccounting",
    "exhaustionStatus" "ProviderAccountingExhaustion",
    "exhaustionReason" TEXT,
    "recoveryState" "ProviderRecoveryState",
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "recoveryReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_operation_evidence_pkey" PRIMARY KEY ("operationPk")
);

-- CreateTable
CREATE TABLE "provider_partial_evidence" (
    "id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "rankCheckId" TEXT NOT NULL,
    "kind" "ProviderPartialEvidenceKind" NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "payloadEncrypted" TEXT NOT NULL,
    "identityHash" TEXT NOT NULL,
    "returnedDepth" INTEGER,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_partial_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_incidents" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "state" "ProviderIncidentState" NOT NULL DEFAULT 'open',
    "openSlot" TEXT DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 1,
    "resultUnderReviewCount" INTEGER NOT NULL DEFAULT 0,
    "resultRecoveredCount" INTEGER NOT NULL DEFAULT 0,
    "resultPartialCount" INTEGER NOT NULL DEFAULT 0,
    "resultProviderErrorCount" INTEGER NOT NULL DEFAULT 0,
    "resultMissingCount" INTEGER NOT NULL DEFAULT 0,
    "costMeasuredCount" INTEGER NOT NULL DEFAULT 0,
    "costUnknownCount" INTEGER NOT NULL DEFAULT 0,
    "costUnderReviewCount" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_incident_operations" (
    "incidentId" TEXT NOT NULL,
    "operationPk" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_incident_operations_pkey" PRIMARY KEY ("incidentId","operationPk")
);

-- CreateTable
CREATE TABLE "provider_incident_transitions" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "ProviderIncidentTransitionKind" NOT NULL,
    "counts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_incident_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_incident_delivery_watermarks" (
    "projectId" TEXT NOT NULL,
    "deliveredThrough" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_incident_delivery_watermarks_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "check_notification_summaries" (
    "notificationId" TEXT NOT NULL,
    "checkIds" TEXT[],
    "topN" INTEGER NOT NULL,
    "positionMove" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "withdrawn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "check_notification_summaries_pkey" PRIMARY KEY ("notificationId")
);

-- CreateTable
CREATE TABLE "weekly_digest_sends" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_digest_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_tray_dismissals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "run_tray_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_partial_evidence_rankCheckId_idx" ON "provider_partial_evidence"("rankCheckId");

-- CreateIndex
CREATE INDEX "provider_partial_evidence_expiry_idx" ON "provider_partial_evidence"("expiresAt");

-- CreateIndex
CREATE INDEX "provider_incidents_projectId_state_idx" ON "provider_incidents"("projectId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "provider_incidents_project_cause" ON "provider_incidents"("projectId", "cause");

-- CreateIndex
CREATE UNIQUE INDEX "provider_incident_operations_operationPk_key" ON "provider_incident_operations"("operationPk");

-- CreateIndex
CREATE UNIQUE INDEX "provider_incident_transitions_version" ON "provider_incident_transitions"("incidentId", "version");

-- CreateIndex
CREATE INDEX "weekly_digest_sends_projectId_periodEnd_idx" ON "weekly_digest_sends"("projectId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_digest_sends_recipient_period" ON "weekly_digest_sends"("userId", "projectId", "periodEnd");

-- CreateIndex
CREATE INDEX "run_tray_dismissals_expiresAt_idx" ON "run_tray_dismissals"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "run_tray_dismissals_user_run" ON "run_tray_dismissals"("userId", "runId");

-- AddForeignKey
ALTER TABLE "provider_operation_evidence" ADD CONSTRAINT "provider_operation_evidence_operationPk_fkey" FOREIGN KEY ("operationPk") REFERENCES "metering_operation"("operation_pk") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "provider_partial_evidence" ADD CONSTRAINT "provider_partial_evidence_rankCheckId_fkey" FOREIGN KEY ("rankCheckId") REFERENCES "rank_checks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "provider_incidents" ADD CONSTRAINT "provider_incidents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "provider_incident_operations" ADD CONSTRAINT "provider_incident_operations_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "provider_incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "provider_incident_operations" ADD CONSTRAINT "provider_incident_operations_operationPk_fkey" FOREIGN KEY ("operationPk") REFERENCES "metering_operation"("operation_pk") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "provider_incident_transitions" ADD CONSTRAINT "provider_incident_transitions_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "provider_incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "provider_incident_delivery_watermarks" ADD CONSTRAINT "provider_incident_delivery_watermarks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "check_notification_summaries" ADD CONSTRAINT "check_notification_summaries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "weekly_digest_sends" ADD CONSTRAINT "weekly_digest_sends_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "weekly_digest_sends" ADD CONSTRAINT "weekly_digest_sends_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "run_tray_dismissals" ADD CONSTRAINT "run_tray_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "run_tray_dismissals" ADD CONSTRAINT "run_tray_dismissals_runId_fkey" FOREIGN KEY ("runId") REFERENCES "rank_check_runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Existing preference rows take Important for the new check setting.
-- checkInApp is not rewritten. A user with no row stays absent and reads Important from the defaults helper.
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_threshold_range_check" CHECK (
  "checkNotificationTopN" BETWEEN 1 AND 100
  AND "checkNotificationPositionMove" BETWEEN 1 AND 100
);

ALTER TABLE "provider_operation_evidence" ADD CONSTRAINT "provider_operation_evidence_depth_check" CHECK (
  "returnedDepth" IS NULL OR "returnedDepth" BETWEEN 0 AND 100
);
ALTER TABLE "provider_operation_evidence" ADD CONSTRAINT "provider_operation_evidence_exhaustion_check" CHECK (
  ("exhaustionStatus" IS NULL AND "exhaustionReason" IS NULL)
  OR ("exhaustionStatus" IS NOT NULL AND (("exhaustionStatus" = 'exhausted' AND "exhaustionReason" IS NOT NULL AND char_length("exhaustionReason") BETWEEN 1 AND 500)
  OR ("exhaustionStatus" IN ('pending', 'not_applicable') AND "exhaustionReason" IS NULL)))
);
ALTER TABLE "provider_operation_evidence" ADD CONSTRAINT "provider_operation_evidence_recovery_reason_check" CHECK (
  "recoveryReason" IS NULL OR char_length("recoveryReason") BETWEEN 1 AND 500
);

ALTER TABLE "provider_partial_evidence" ADD CONSTRAINT "provider_partial_evidence_depth_check" CHECK (
  "returnedDepth" IS NULL OR "returnedDepth" BETWEEN 0 AND 100
);
ALTER TABLE "provider_partial_evidence" ADD CONSTRAINT "provider_partial_evidence_version_check" CHECK (
  "schemaVersion" >= 1
);

ALTER TABLE "provider_incidents" ADD CONSTRAINT "provider_incidents_open_slot_check" CHECK (
  ("state" = 'open' AND "openSlot" IS NOT NULL AND "openSlot" = 'open' AND "resolvedAt" IS NULL)
  OR ("state" = 'resolved' AND "openSlot" IS NULL AND "resolvedAt" IS NOT NULL)
);
ALTER TABLE "provider_incidents" ADD CONSTRAINT "provider_incidents_cause_check" CHECK (
  "cause" ~ '^[a-z][a-z0-9_]{0,63}$'
);
ALTER TABLE "provider_incidents" ADD CONSTRAINT "provider_incidents_counts_check" CHECK (
  "version" >= 1
  AND "resultUnderReviewCount" >= 0
  AND "resultRecoveredCount" >= 0
  AND "resultPartialCount" >= 0
  AND "resultProviderErrorCount" >= 0
  AND "resultMissingCount" >= 0
  AND "costMeasuredCount" >= 0
  AND "costUnknownCount" >= 0
  AND "costUnderReviewCount" >= 0
);

ALTER TABLE "provider_incident_transitions" ADD CONSTRAINT "provider_incident_transitions_version_check" CHECK (
  "version" >= 1
);

ALTER TABLE "check_notification_summaries" ADD CONSTRAINT "check_notification_summaries_threshold_check" CHECK (
  "topN" BETWEEN 1 AND 100
  AND "positionMove" BETWEEN 1 AND 100
  AND "version" >= 1
);

ALTER TABLE "weekly_digest_sends" ADD CONSTRAINT "weekly_digest_sends_period_check" CHECK (
  "periodEnd" > "periodStart"
);

ALTER TABLE "run_tray_dismissals" ADD CONSTRAINT "run_tray_dismissals_expiry_check" CHECK (
  "expiresAt" > "dismissedAt"
);
