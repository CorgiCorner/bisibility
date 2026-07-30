-- CreateEnum
CREATE TYPE "AlertConditionType" AS ENUM ('threshold', 'change_pct', 'enters_top_n', 'exits_top_n', 'competitor_overtake', 'serp_feature');

-- CreateEnum
CREATE TYPE "AlertTargetType" AS ENUM ('keyword', 'tag', 'all');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('email', 'slack', 'webhook');

-- CreateEnum
CREATE TYPE "TriggeredAlertStatus" AS ENUM ('firing', 'resolved', 'acknowledged', 'muted');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('alert_fired', 'check_complete', 'check_failed', 'invite', 'member_joined', 'import_done', 'import_failed', 'system');

-- CreateEnum
CREATE TYPE "MigrationScope" AS ENUM ('keywords', 'full');

-- CreateEnum
CREATE TYPE "CloudImportState" AS ENUM ('idle', 'receiving', 'importing', 'done', 'failed');

-- AlterTable
ALTER TABLE "provider_connections" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conditionType" "AlertConditionType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "targetType" "AlertTargetType" NOT NULL DEFAULT 'all',
    "thresholdPosition" INTEGER,
    "changePct" DECIMAL(65,30),
    "topN" INTEGER,
    "serpFeature" TEXT,
    "competitorDomain" TEXT,
    "channels" "AlertChannel"[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rule_targets" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "keywordId" TEXT,
    "tagId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rule_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triggered_alerts" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "rankCheckId" TEXT,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beforePosition" INTEGER,
    "afterPosition" INTEGER,
    "status" "TriggeredAlertStatus" NOT NULL DEFAULT 'firing',
    "payload" JSONB,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "triggered_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "hmacSecret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "lastDeliveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_connections" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "channelId" TEXT,
    "channelName" TEXT,
    "accessTokenHash" TEXT NOT NULL,
    "scope" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "installedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'member',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_tokens" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "scope" "MigrationScope" NOT NULL DEFAULT 'full',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "singleUse" BOOLEAN NOT NULL DEFAULT true,
    "consumedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cloud_import_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tokenId" TEXT,
    "state" "CloudImportState" NOT NULL DEFAULT 'idle',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "counts" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_rules_projectId_idx" ON "alert_rules"("projectId");

-- CreateIndex
CREATE INDEX "alert_rules_projectId_enabled_idx" ON "alert_rules"("projectId", "enabled");

-- CreateIndex
CREATE INDEX "alert_rule_targets_ruleId_idx" ON "alert_rule_targets"("ruleId");

-- CreateIndex
CREATE INDEX "alert_rule_targets_keywordId_idx" ON "alert_rule_targets"("keywordId");

-- CreateIndex
CREATE INDEX "alert_rule_targets_tagId_idx" ON "alert_rule_targets"("tagId");

-- CreateIndex
CREATE INDEX "triggered_alerts_ruleId_idx" ON "triggered_alerts"("ruleId");

-- CreateIndex
CREATE INDEX "triggered_alerts_keywordId_firedAt_idx" ON "triggered_alerts"("keywordId", "firedAt");

-- CreateIndex
CREATE INDEX "triggered_alerts_status_idx" ON "triggered_alerts"("status");

-- CreateIndex
CREATE INDEX "webhook_endpoints_projectId_idx" ON "webhook_endpoints"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "slack_connections_projectId_key" ON "slack_connections"("projectId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_projectId_idx" ON "notifications"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_projectId_idx" ON "invites"("projectId");

-- CreateIndex
CREATE INDEX "invites_email_idx" ON "invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invites_projectId_email_key" ON "invites"("projectId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "migration_tokens_hash_key" ON "migration_tokens"("hash");

-- CreateIndex
CREATE INDEX "migration_tokens_projectId_idx" ON "migration_tokens"("projectId");

-- CreateIndex
CREATE INDEX "cloud_import_jobs_projectId_idx" ON "cloud_import_jobs"("projectId");

-- CreateIndex
CREATE INDEX "cloud_import_jobs_state_idx" ON "cloud_import_jobs"("state");

-- CreateIndex
CREATE INDEX "provider_connections_projectId_kind_priority_idx" ON "provider_connections"("projectId", "kind", "priority");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_targets" ADD CONSTRAINT "alert_rule_targets_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_targets" ADD CONSTRAINT "alert_rule_targets_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_targets" ADD CONSTRAINT "alert_rule_targets_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggered_alerts" ADD CONSTRAINT "triggered_alerts_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggered_alerts" ADD CONSTRAINT "triggered_alerts_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggered_alerts" ADD CONSTRAINT "triggered_alerts_rankCheckId_fkey" FOREIGN KEY ("rankCheckId") REFERENCES "rank_checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_connections" ADD CONSTRAINT "slack_connections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_connections" ADD CONSTRAINT "slack_connections_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_tokens" ADD CONSTRAINT "migration_tokens_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_tokens" ADD CONSTRAINT "migration_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_import_jobs" ADD CONSTRAINT "cloud_import_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_import_jobs" ADD CONSTRAINT "cloud_import_jobs_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "migration_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
