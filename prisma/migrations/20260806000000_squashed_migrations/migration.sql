-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('email', 'slack', 'webhook');

-- CreateEnum
CREATE TYPE "AlertConditionType" AS ENUM ('threshold', 'change_pct', 'enters_top_n', 'exits_top_n', 'competitor_overtake', 'serp_feature', 'url_mismatch', 'position_drop', 'downtrend', 'ctr_drop');

-- CreateEnum
CREATE TYPE "AlertDeliveryState" AS ENUM ('pending', 'digest_pending', 'digesting', 'digested', 'suppressed', 'delivering', 'delivered', 'dead_letter', 'skipped');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'urgent');

-- CreateEnum
CREATE TYPE "AlertTargetType" AS ENUM ('keyword', 'tag', 'all');

-- CreateEnum
CREATE TYPE "CloudImportState" AS ENUM ('idle', 'receiving', 'importing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "Device" AS ENUM ('desktop', 'mobile');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('country', 'region', 'city');

-- CreateEnum
CREATE TYPE "MigrationScope" AS ENUM ('keywords', 'full');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('alert_fired', 'check_complete', 'check_failed', 'invite', 'member_joined', 'import_done', 'import_failed', 'system');

-- CreateEnum
CREATE TYPE "ProjectWriteMode" AS ENUM ('active', 'migration_hold', 'migrated');

-- CreateEnum
CREATE TYPE "ProviderCostFeature" AS ENUM ('keyword_metrics', 'keyword_research', 'rank_check', 'ranked_keywords', 'backlinks');

-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('serp', 'analytics', 'enrichment');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('connected', 'ready', 'planned', 'optional', 'needs_reauth');

-- CreateEnum
CREATE TYPE "RankCheckFrequency" AS ENUM ('paused', 'manual', 'daily', 'weekly', 'custom_cron', 'monthly');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'member', 'viewer', 'auditor');

-- CreateEnum
CREATE TYPE "SignalSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('rank_tracker', 'search_analytics', 'url_inspection', 'sitemap', 'deploy', 'cms', 'search_engine_status', 'manual', 'api');

-- CreateEnum
CREATE TYPE "TriggeredAlertStatus" AS ENUM ('firing', 'resolved', 'acknowledged', 'muted');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "password" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rule_daily_stats" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "suppressedCount" INTEGER NOT NULL DEFAULT 0,
    "overflowNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rule_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rule_recipients" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rule_recipients_pkey" PRIMARY KEY ("id")
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
    "dropPositions" INTEGER,
    "publicId" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['read', 'write', 'admin']::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "publicId" TEXT NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT,
    "sourceIpHash" TEXT,
    "sourceIpMasked" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "statusReason" TEXT,
    "userAgent" TEXT,
    "appVersion" TEXT,
    "publicId" TEXT NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlink_rows" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "anchor" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "flags" TEXT[],
    "domainAuthority" INTEGER NOT NULL,
    "spamScore" DOUBLE PRECISION NOT NULL,
    "linksCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "backlink_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlink_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetScope" TEXT NOT NULL,
    "includeSubdomains" BOOLEAN NOT NULL DEFAULT true,
    "summary" JSONB NOT NULL,
    "history" JSONB NOT NULL,
    "fetchedRowCount" INTEGER NOT NULL,
    "totalRowsAvailable" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlink_snapshots_pkey" PRIMARY KEY ("id")
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
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chunkCount" INTEGER,
    "chunksReceived" INTEGER NOT NULL DEFAULT 0,
    "chunksImported" INTEGER NOT NULL DEFAULT 0,
    "manifest" JSONB,
    "publicId" TEXT NOT NULL,

    CONSTRAINT "cloud_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publicId" TEXT NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_send_counters" (
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_send_counters_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "data_migrations" (
    "id" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "runCompletedAt" TIMESTAMP(3),
    "finalizationAttempts" INTEGER NOT NULL DEFAULT 0,
    "finalizationFailedAt" TIMESTAMP(3),
    "finalizationError" TEXT,

    CONSTRAINT "data_migrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "triggeredAlertId" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "webhookEndpointId" TEXT,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_daily_stats" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "exhaustionNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_hooks" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingest_hooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instance_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instance_settings_pkey" PRIMARY KEY ("key")
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
    "publicId" TEXT NOT NULL,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jwks" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "jwks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_dispatch_states" (
    "keywordId" TEXT NOT NULL,
    "nextCheckAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_dispatch_states_pkey" PRIMARY KEY ("keywordId")
);

-- CreateTable
CREATE TABLE "keyword_schedules" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "frequency" "RankCheckFrequency" NOT NULL,
    "cronExpression" TEXT,
    "timezone" TEXT NOT NULL,
    "jitterMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastCheckedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "serpDepth" INTEGER,

    CONSTRAINT "keyword_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_tags" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_traffic_snapshots" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 28,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_traffic_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "device" "Device" NOT NULL DEFAULT 'desktop',
    "targetUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "locationId" TEXT NOT NULL,
    "topic" TEXT,
    "intent" TEXT,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "regionCode" TEXT,
    "cityName" TEXT,
    "gl" TEXT NOT NULL,
    "hl" TEXT NOT NULL,
    "languageLabel" TEXT NOT NULL,
    "primaryGeoCode" INTEGER,
    "primaryGeoName" TEXT NOT NULL,
    "secondaryGeoName" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publicId" TEXT NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_import_chunks" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "migration_import_chunks_pkey" PRIMARY KEY ("id")
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
    "publicId" TEXT NOT NULL,

    CONSTRAINT "migration_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "alertEmail" BOOLEAN NOT NULL DEFAULT true,
    "alertInApp" BOOLEAN NOT NULL DEFAULT true,
    "checkEmail" BOOLEAN NOT NULL DEFAULT false,
    "checkInApp" BOOLEAN NOT NULL DEFAULT false,
    "inviteEmail" BOOLEAN NOT NULL DEFAULT true,
    "inviteInApp" BOOLEAN NOT NULL DEFAULT true,
    "importEmail" BOOLEAN NOT NULL DEFAULT true,
    "importInApp" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportEmail" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
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
    "idempotencyKey" TEXT,
    "publicId" TEXT NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthAccessToken" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "scopes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauthAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthAccessTokenV2" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "referenceId" TEXT,
    "refreshId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scopes" TEXT[],

    CONSTRAINT "oauthAccessTokenV2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "metadata" TEXT,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "redirectUrls" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauthApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "disabled" BOOLEAN DEFAULT false,
    "skipConsent" BOOLEAN,
    "enableEndSession" BOOLEAN,
    "subjectType" TEXT,
    "scopes" TEXT[],
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "name" TEXT,
    "uri" TEXT,
    "icon" TEXT,
    "contacts" TEXT[],
    "tos" TEXT,
    "policy" TEXT,
    "softwareId" TEXT,
    "softwareVersion" TEXT,
    "softwareStatement" TEXT,
    "redirectUris" TEXT[],
    "postLogoutRedirectUris" TEXT[],
    "tokenEndpointAuthMethod" TEXT,
    "grantTypes" TEXT[],
    "responseTypes" TEXT[],
    "public" BOOLEAN,
    "type" TEXT,
    "requirePKCE" BOOLEAN,
    "referenceId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "oauthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthConsent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consentGiven" BOOLEAN NOT NULL,

    CONSTRAINT "oauthConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthConsentV2" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "referenceId" TEXT,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauthConsentV2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "referenceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" TIMESTAMP(3),
    "authTime" TIMESTAMP(3),
    "scopes" TEXT[],

    CONSTRAINT "oauthRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_runs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "projectId" TEXT,
    "connectionId" TEXT,
    "provider" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "error" TEXT,
    "meta" JSONB,
    "errorClass" TEXT,

    CONSTRAINT "operational_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_events" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fields" JSONB,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "ops_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_traffic_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 28,
    "sessions" INTEGER NOT NULL,
    "visitors" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "bounceRate" DOUBLE PRECISION,
    "visitDurationSeconds" DOUBLE PRECISION,
    "keyEvents" DOUBLE PRECISION,
    "scrollDepth" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_traffic_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_access_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['read']::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publicId" TEXT NOT NULL,

    CONSTRAINT "personal_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_defaults" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "frequency" "RankCheckFrequency" NOT NULL DEFAULT 'daily',
    "cronExpression" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "jitterMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastCheckedAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "locationKey" TEXT,
    "country" TEXT,
    "city" TEXT,
    "device" "Device",
    "serpDepth" INTEGER NOT NULL DEFAULT 100,
    "inspectionDailyLimit" INTEGER NOT NULL DEFAULT 50,
    "serpStopOnMatch" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "project_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "trackingScope" TEXT NOT NULL DEFAULT 'country',
    "writeMode" "ProjectWriteMode" NOT NULL DEFAULT 'active',
    "writeModeChangedAt" TIMESTAMP(3),
    "writeModeChangedById" TEXT,
    "sitemapMonitoringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "budgetCapCents" INTEGER NOT NULL DEFAULT 5000,
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_connection_rates" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "feature" "ProviderCostFeature" NOT NULL,
    "amountCents" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_connection_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_connections" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ProviderKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "ProviderStatus" NOT NULL,
    "credentialsEncrypted" TEXT,
    "costPerCheckCents" DECIMAL(10,4),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "publicId" TEXT NOT NULL,

    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_cost_entries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "feature" "ProviderCostFeature" NOT NULL DEFAULT 'ranked_keywords',
    "costCents" DECIMAL(10,4) NOT NULL,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "unitCostCents" DECIMAL(10,4),

    CONSTRAINT "provider_cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queued_rank_check_batches" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "connectionId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'dataforseo',
    "priority" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL,
    "queueDeadlineAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "ambiguousAt" TIMESTAMP(3),
    "terminalAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queued_rank_check_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queued_rank_check_tasks" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "rankCheckId" TEXT NOT NULL,
    "providerTaskId" TEXT,
    "state" TEXT NOT NULL,
    "costCents" DECIMAL(10,4),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "persistenceLeaseOwner" TEXT,
    "persistenceLeaseExpiresAt" TIMESTAMP(3),

    CONSTRAINT "queued_rank_check_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rank_check_raw_purge_progress" (
    "id" TEXT NOT NULL,
    "cutoff" TIMESTAMP(3),
    "retentionDays" INTEGER,
    "maxBatches" INTEGER NOT NULL,
    "batchCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "hasMore" BOOLEAN NOT NULL DEFAULT false,
    "resultClearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rank_check_raw_purge_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rank_checks" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "position" INTEGER,
    "previousPosition" INTEGER,
    "rankingUrl" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "costCents" DECIMAL(10,4),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "error" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "estimatedCostCents" DECIMAL(10,4),
    "attempts" JSONB,
    "billingUnits" INTEGER,
    "requestedDepth" INTEGER,
    "trigger" TEXT,
    "scheduleId" TEXT,
    "workflowRunId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "deferredReason" TEXT,
    "organicRanks" JSONB,
    "viaFallback" BOOLEAN NOT NULL DEFAULT false,
    "degradedToCountry" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "publicId" TEXT NOT NULL,
    "normalizationVersion" TEXT DEFAULT 'v1',

    CONSTRAINT "rank_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_keywords" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "volume" INTEGER,
    "difficulty" INTEGER,
    "cpc" DOUBLE PRECISION,
    "intent" TEXT,
    "trend" JSONB,
    "variantCount" INTEGER NOT NULL DEFAULT 0,
    "sourceSeed" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "surface" TEXT NOT NULL DEFAULT 'keywords',
    "publicId" TEXT NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publicId" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "keywordId" TEXT,
    "source" "SignalSource" NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "SignalSeverity" NOT NULL DEFAULT 'info',
    "url" TEXT,
    "payload" JSONB,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitemap_snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sitemapUrl" TEXT NOT NULL,
    "urlCount" INTEGER NOT NULL,
    "entries" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sitemap_snapshots_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publicId" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
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
    "snoozedUntil" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "deliveryState" "AlertDeliveryState" NOT NULL DEFAULT 'pending',
    "deliveryClaimedAt" TIMESTAMP(3),
    "deliveryBudgetReservedAt" TIMESTAMP(3),
    "deliveryClaimToken" TEXT,
    "publicId" TEXT NOT NULL,

    CONSTRAINT "triggered_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twoFactor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN DEFAULT true,
    "failedVerificationCount" INTEGER DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "twoFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "url_presences" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "verdict" TEXT,
    "coverageState" TEXT,
    "lastCrawlAt" TIMESTAMP(3),
    "canonicalOk" BOOLEAN,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "url_presences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isInstanceAdmin" BOOLEAN NOT NULL DEFAULT false,
    "deactivatedAt" TIMESTAMP(3),
    "publicId" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlists" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "cloudPrice" TEXT,
    "submissions" INTEGER NOT NULL DEFAULT 1,
    "lastSubmittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlists_pkey" PRIMARY KEY ("id")
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
    "publicId" TEXT NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId" ASC, "accountId" ASC);

-- CreateIndex
CREATE INDEX "accounts_providerId_idx" ON "accounts"("providerId" ASC);

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "alert_rule_daily_stats_ruleId_day_key" ON "alert_rule_daily_stats"("ruleId" ASC, "day" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "alert_rule_recipients_ruleId_userId_key" ON "alert_rule_recipients"("ruleId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "alert_rule_recipients_userId_idx" ON "alert_rule_recipients"("userId" ASC);

-- CreateIndex
CREATE INDEX "alert_rule_targets_keywordId_idx" ON "alert_rule_targets"("keywordId" ASC);

-- CreateIndex
CREATE INDEX "alert_rule_targets_ruleId_idx" ON "alert_rule_targets"("ruleId" ASC);

-- CreateIndex
CREATE INDEX "alert_rule_targets_tagId_idx" ON "alert_rule_targets"("tagId" ASC);

-- CreateIndex
CREATE INDEX "alert_rules_projectId_enabled_idx" ON "alert_rules"("projectId" ASC, "enabled" ASC);

-- CreateIndex
CREATE INDEX "alert_rules_projectId_idx" ON "alert_rules"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "alert_rules_publicId_key" ON "alert_rules"("publicId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_hashedKey_key" ON "api_keys"("hashedKey" ASC);

-- CreateIndex
CREATE INDEX "api_keys_prefix_idx" ON "api_keys"("prefix" ASC);

-- CreateIndex
CREATE INDEX "api_keys_projectId_idx" ON "api_keys"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_publicId_key" ON "api_keys"("publicId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_projectId_idx" ON "audit_logs"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_publicId_key" ON "audit_logs"("publicId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType" ASC, "targetId" ASC);

-- CreateIndex
CREATE INDEX "backlink_rows_snapshotId_sourceDomain_idx" ON "backlink_rows"("snapshotId" ASC, "sourceDomain" ASC);

-- CreateIndex
CREATE INDEX "backlink_snapshots_projectId_target_targetScope_includeSubd_idx" ON "backlink_snapshots"("projectId" ASC, "target" ASC, "targetScope" ASC, "includeSubdomains" ASC, "fetchedAt" ASC);

-- CreateIndex
CREATE INDEX "cloud_import_jobs_finishedAt_idx" ON "cloud_import_jobs"("finishedAt" ASC);

-- CreateIndex
CREATE INDEX "cloud_import_jobs_projectId_idx" ON "cloud_import_jobs"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_import_jobs_publicId_key" ON "cloud_import_jobs"("publicId" ASC);

-- CreateIndex
CREATE INDEX "cloud_import_jobs_state_idx" ON "cloud_import_jobs"("state" ASC);

-- CreateIndex
CREATE INDEX "cloud_import_jobs_state_updatedAt_idx" ON "cloud_import_jobs"("state" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "competitors_projectId_domain_key" ON "competitors"("projectId" ASC, "domain" ASC);

-- CreateIndex
CREATE INDEX "competitors_projectId_idx" ON "competitors"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "competitors_publicId_key" ON "competitors"("publicId" ASC);

-- CreateIndex
CREATE INDEX "delivery_attempts_attemptedAt_idx" ON "delivery_attempts"("attemptedAt" ASC);

-- CreateIndex
CREATE INDEX "delivery_attempts_triggeredAlertId_idx" ON "delivery_attempts"("triggeredAlertId" ASC);

-- CreateIndex
CREATE INDEX "delivery_attempts_webhookEndpointId_idx" ON "delivery_attempts"("webhookEndpointId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "email_daily_stats_day_category_key" ON "email_daily_stats"("day" ASC, "category" ASC);

-- CreateIndex
CREATE INDEX "ingest_hooks_projectId_idx" ON "ingest_hooks"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ingest_hooks_publicId_key" ON "ingest_hooks"("publicId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ingest_hooks_tokenHash_key" ON "ingest_hooks"("tokenHash" ASC);

-- CreateIndex
CREATE INDEX "invites_email_idx" ON "invites"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "invites_projectId_email_key" ON "invites"("projectId" ASC, "email" ASC);

-- CreateIndex
CREATE INDEX "invites_projectId_idx" ON "invites"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "invites_publicId_key" ON "invites"("publicId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token" ASC);

-- CreateIndex
CREATE INDEX "keyword_dispatch_states_nextCheckAt_keywordId_idx" ON "keyword_dispatch_states"("nextCheckAt" ASC, "keywordId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "keyword_schedules_keywordId_key" ON "keyword_schedules"("keywordId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "keyword_tags_keywordId_tagId_key" ON "keyword_tags"("keywordId" ASC, "tagId" ASC);

-- CreateIndex
CREATE INDEX "keyword_tags_tagId_idx" ON "keyword_tags"("tagId" ASC);

-- CreateIndex
CREATE INDEX "keyword_traffic_snapshots_keywordId_date_idx" ON "keyword_traffic_snapshots"("keywordId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "keyword_traffic_snapshots_keyword_provider_date_window_key" ON "keyword_traffic_snapshots"("keywordId" ASC, "provider" ASC, "date" ASC, "windowDays" ASC);

-- CreateIndex
CREATE INDEX "keywords_locationId_idx" ON "keywords"("locationId" ASC);

-- CreateIndex
CREATE INDEX "keywords_projectId_idx" ON "keywords"("projectId" ASC);

-- CreateIndex
CREATE INDEX "keywords_projectId_normalized_text_idx" ON "keywords"("projectId" ASC, lower(btrim("text")));

-- CreateIndex
CREATE UNIQUE INDEX "keywords_projectId_text_locationId_device_key" ON "keywords"("projectId" ASC, "text" ASC, "locationId" ASC, "device" ASC);

-- CreateIndex
CREATE INDEX "keywords_projectId_topic_idx" ON "keywords"("projectId" ASC, "topic" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "keywords_publicId_key" ON "keywords"("publicId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "locations_canonicalKey_key" ON "locations"("canonicalKey" ASC);

-- CreateIndex
CREATE INDEX "locations_countryCode_idx" ON "locations"("countryCode" ASC);

-- CreateIndex
CREATE INDEX "memberships_projectId_idx" ON "memberships"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "memberships_publicId_key" ON "memberships"("publicId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_projectId_key" ON "memberships"("userId" ASC, "projectId" ASC);

-- CreateIndex
CREATE INDEX "migration_import_chunks_jobId_idx" ON "migration_import_chunks"("jobId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "migration_import_chunks_jobId_index_key" ON "migration_import_chunks"("jobId" ASC, "index" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "migration_tokens_hash_key" ON "migration_tokens"("hash" ASC);

-- CreateIndex
CREATE INDEX "migration_tokens_projectId_idx" ON "migration_tokens"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "migration_tokens_publicId_key" ON "migration_tokens"("publicId" ASC);

-- CreateIndex
CREATE INDEX "notification_preferences_projectId_idx" ON "notification_preferences"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_projectId_key" ON "notification_preferences"("userId" ASC, "projectId" ASC);

-- CreateIndex
CREATE INDEX "notifications_projectId_idx" ON "notifications"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_publicId_key" ON "notifications"("publicId" ASC);

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_idempotencyKey_key" ON "notifications"("userId" ASC, "idempotencyKey" ASC);

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId" ASC, "readAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "oauthAccessToken_accessToken_key" ON "oauthAccessToken"("accessToken" ASC);

-- CreateIndex
CREATE INDEX "oauthAccessToken_clientId_idx" ON "oauthAccessToken"("clientId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "oauthAccessToken_refreshToken_key" ON "oauthAccessToken"("refreshToken" ASC);

-- CreateIndex
CREATE INDEX "oauthAccessToken_userId_idx" ON "oauthAccessToken"("userId" ASC);

-- CreateIndex
CREATE INDEX "oauthAccessTokenV2_clientId_idx" ON "oauthAccessTokenV2"("clientId" ASC);

-- CreateIndex
CREATE INDEX "oauthAccessTokenV2_refreshId_idx" ON "oauthAccessTokenV2"("refreshId" ASC);

-- CreateIndex
CREATE INDEX "oauthAccessTokenV2_sessionId_idx" ON "oauthAccessTokenV2"("sessionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "oauthAccessTokenV2_token_key" ON "oauthAccessTokenV2"("token" ASC);

-- CreateIndex
CREATE INDEX "oauthAccessTokenV2_userId_idx" ON "oauthAccessTokenV2"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "oauthApplication_clientId_key" ON "oauthApplication"("clientId" ASC);

-- CreateIndex
CREATE INDEX "oauthApplication_userId_idx" ON "oauthApplication"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "oauthClient_clientId_key" ON "oauthClient"("clientId" ASC);

-- CreateIndex
CREATE INDEX "oauthClient_userId_idx" ON "oauthClient"("userId" ASC);

-- CreateIndex
CREATE INDEX "oauthConsent_clientId_idx" ON "oauthConsent"("clientId" ASC);

-- CreateIndex
CREATE INDEX "oauthConsent_userId_idx" ON "oauthConsent"("userId" ASC);

-- CreateIndex
CREATE INDEX "oauthConsentV2_clientId_idx" ON "oauthConsentV2"("clientId" ASC);

-- CreateIndex
CREATE INDEX "oauthConsentV2_userId_idx" ON "oauthConsentV2"("userId" ASC);

-- CreateIndex
CREATE INDEX "oauthRefreshToken_clientId_idx" ON "oauthRefreshToken"("clientId" ASC);

-- CreateIndex
CREATE INDEX "oauthRefreshToken_sessionId_idx" ON "oauthRefreshToken"("sessionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "oauthRefreshToken_token_key" ON "oauthRefreshToken"("token" ASC);

-- CreateIndex
CREATE INDEX "oauthRefreshToken_userId_idx" ON "oauthRefreshToken"("userId" ASC);

-- CreateIndex
CREATE INDEX "operational_runs_kind_startedAt_idx" ON "operational_runs"("kind" ASC, "startedAt" ASC);

-- CreateIndex
CREATE INDEX "operational_runs_projectId_provider_startedAt_idx" ON "operational_runs"("projectId" ASC, "provider" ASC, "startedAt" ASC);

-- CreateIndex
CREATE INDEX "ops_events_deliveredAt_createdAt_idx" ON "ops_events"("deliveredAt" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "page_traffic_snapshots_projectId_path_date_idx" ON "page_traffic_snapshots"("projectId" ASC, "path" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "page_traffic_snapshots_project_provider_path_date_window_key" ON "page_traffic_snapshots"("projectId" ASC, "provider" ASC, "path" ASC, "date" ASC, "windowDays" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "personal_access_tokens_hashedKey_key" ON "personal_access_tokens"("hashedKey" ASC);

-- CreateIndex
CREATE INDEX "personal_access_tokens_prefix_idx" ON "personal_access_tokens"("prefix" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "personal_access_tokens_publicId_key" ON "personal_access_tokens"("publicId" ASC);

-- CreateIndex
CREATE INDEX "personal_access_tokens_userId_idx" ON "personal_access_tokens"("userId" ASC);

-- CreateIndex
CREATE INDEX "project_defaults_locationKey_idx" ON "project_defaults"("locationKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "project_defaults_projectId_key" ON "project_defaults"("projectId" ASC);

-- CreateIndex
CREATE INDEX "projects_ownerId_idx" ON "projects"("ownerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "projects_publicId_key" ON "projects"("publicId" ASC);

-- CreateIndex
CREATE INDEX "projects_writeModeChangedById_idx" ON "projects"("writeModeChangedById" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "provider_connection_rates_connectionId_feature_key" ON "provider_connection_rates"("connectionId" ASC, "feature" ASC);

-- CreateIndex
CREATE INDEX "provider_connection_rates_connectionId_idx" ON "provider_connection_rates"("connectionId" ASC);

-- CreateIndex
CREATE INDEX "provider_connections_projectId_idx" ON "provider_connections"("projectId" ASC);

-- CreateIndex
CREATE INDEX "provider_connections_projectId_kind_priority_idx" ON "provider_connections"("projectId" ASC, "kind" ASC, "priority" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "provider_connections_projectId_provider_key" ON "provider_connections"("projectId" ASC, "provider" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "provider_connections_publicId_key" ON "provider_connections"("publicId" ASC);

-- CreateIndex
CREATE INDEX "provider_cost_entries_connectionId_createdAt_idx" ON "provider_cost_entries"("connectionId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "provider_cost_entries_connectionId_feature_createdAt_idx" ON "provider_cost_entries"("connectionId" ASC, "feature" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "provider_cost_entries_projectId_createdAt_idx" ON "provider_cost_entries"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "queued_rank_check_batches_active_queueDeadlineAt_id_idx" ON "queued_rank_check_batches"("queueDeadlineAt" ASC, "id" ASC) WHERE "state" = ANY (ARRAY['ambiguous'::text, 'prepared'::text, 'ready'::text, 'submitted'::text, 'submitting'::text]);

-- CreateIndex
CREATE INDEX "queued_rank_check_batches_projectId_createdAt_idx" ON "queued_rank_check_batches"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "queued_rank_check_batches_state_expiresAt_idx" ON "queued_rank_check_batches"("state" ASC, "expiresAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "queued_rank_check_tasks_batchId_keywordId_key" ON "queued_rank_check_tasks"("batchId" ASC, "keywordId" ASC);

-- CreateIndex
CREATE INDEX "queued_rank_check_tasks_batchId_state_idx" ON "queued_rank_check_tasks"("batchId" ASC, "state" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "queued_rank_check_tasks_persistenceLeaseOwner_key" ON "queued_rank_check_tasks"("persistenceLeaseOwner" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "queued_rank_check_tasks_providerTaskId_key" ON "queued_rank_check_tasks"("providerTaskId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "queued_rank_check_tasks_rankCheckId_key" ON "queued_rank_check_tasks"("rankCheckId" ASC);

-- CreateIndex
CREATE INDEX "rank_check_raw_purge_progress_reclaim_idx" ON "rank_check_raw_purge_progress"("completed" ASC, "resultClearedAt" ASC, "id" ASC);

-- CreateIndex
CREATE INDEX "rank_check_raw_purge_progress_scrub_idx" ON "rank_check_raw_purge_progress"("id" ASC) WHERE "completed" AND "resultClearedAt" IS NULL;

-- CreateIndex
CREATE INDEX "rank_checks_checkedAt_id_raw_not_null_idx" ON "rank_checks"("checkedAt" ASC, "id" ASC) WHERE "raw" IS NOT NULL;

-- CreateIndex
CREATE INDEX "rank_checks_checkedAt_idx" ON "rank_checks"("checkedAt" ASC);

-- CreateIndex
CREATE INDEX "rank_checks_keywordId_checkedAt_id_idx" ON "rank_checks"("keywordId" ASC, "checkedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rank_checks_keywordId_checkedAt_key" ON "rank_checks"("keywordId" ASC, "checkedAt" ASC);

-- CreateIndex
CREATE INDEX "rank_checks_provider_checkedAt_id_idx" ON "rank_checks"("provider" ASC, "checkedAt" ASC, "id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "rank_checks_publicId_key" ON "rank_checks"("publicId" ASC);

-- CreateIndex
CREATE INDEX "rank_checks_scheduledAt_idx" ON "rank_checks"("scheduledAt" ASC);

-- CreateIndex
CREATE INDEX "rank_checks_startedAt_idx" ON "rank_checks"("startedAt" ASC);

-- CreateIndex
CREATE INDEX "rank_checks_status_checkedAt_idx" ON "rank_checks"("status" ASC, "checkedAt" ASC);

-- CreateIndex
CREATE INDEX "rank_checks_trigger_checkedAt_id_idx" ON "rank_checks"("trigger" ASC, "checkedAt" ASC, "id" ASC);

-- CreateIndex
CREATE INDEX "rank_checks_viaFallback_checkedAt_id_idx" ON "rank_checks"("viaFallback" ASC, "checkedAt" ASC, "id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "saved_keywords_projectId_normalizedText_location_key" ON "saved_keywords"("projectId" ASC, "normalizedText" ASC, "location" ASC);

-- CreateIndex
CREATE INDEX "saved_keywords_projectId_savedAt_idx" ON "saved_keywords"("projectId" ASC, "savedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "saved_keywords_publicId_key" ON "saved_keywords"("publicId" ASC);

-- CreateIndex
CREATE INDEX "saved_views_projectId_surface_idx" ON "saved_views"("projectId" ASC, "surface" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "saved_views_publicId_key" ON "saved_views"("publicId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_publicId_key" ON "sessions"("publicId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token" ASC);

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId" ASC);

-- CreateIndex
CREATE INDEX "signals_keywordId_happenedAt_idx" ON "signals"("keywordId" ASC, "happenedAt" ASC);

-- CreateIndex
CREATE INDEX "signals_projectId_happenedAt_idx" ON "signals"("projectId" ASC, "happenedAt" DESC);

-- CreateIndex
CREATE INDEX "signals_projectId_source_happenedAt_idx" ON "signals"("projectId" ASC, "source" ASC, "happenedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "signals_publicId_key" ON "signals"("publicId" ASC);

-- CreateIndex
CREATE INDEX "sitemap_snapshots_projectId_fetchedAt_idx" ON "sitemap_snapshots"("projectId" ASC, "fetchedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "slack_connections_projectId_key" ON "slack_connections"("projectId" ASC);

-- CreateIndex
CREATE INDEX "tags_projectId_idx" ON "tags"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tags_projectId_name_key" ON "tags"("projectId" ASC, "name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tags_publicId_key" ON "tags"("publicId" ASC);

-- CreateIndex
CREATE INDEX "triggered_alerts_deliveryState_firedAt_idx" ON "triggered_alerts"("deliveryState" ASC, "firedAt" ASC);

-- CreateIndex
CREATE INDEX "triggered_alerts_firedAt_idx" ON "triggered_alerts"("firedAt" ASC);

-- CreateIndex
CREATE INDEX "triggered_alerts_keywordId_firedAt_idx" ON "triggered_alerts"("keywordId" ASC, "firedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "triggered_alerts_publicId_key" ON "triggered_alerts"("publicId" ASC);

-- CreateIndex
CREATE INDEX "triggered_alerts_ruleId_idx" ON "triggered_alerts"("ruleId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "triggered_alerts_ruleId_keywordId_rankCheckId_key" ON "triggered_alerts"("ruleId" ASC, "keywordId" ASC, "rankCheckId" ASC);

-- CreateIndex
CREATE INDEX "triggered_alerts_snoozedUntil_idx" ON "triggered_alerts"("snoozedUntil" ASC);

-- CreateIndex
CREATE INDEX "triggered_alerts_status_idx" ON "triggered_alerts"("status" ASC);

-- CreateIndex
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor"("userId" ASC);

-- CreateIndex
CREATE INDEX "url_presences_projectId_checkedAt_idx" ON "url_presences"("projectId" ASC, "checkedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "url_presences_projectId_url_key" ON "url_presences"("projectId" ASC, "url" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_publicId_key" ON "users"("publicId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "waitlists_email_key" ON "waitlists"("email" ASC);

-- CreateIndex
CREATE INDEX "webhook_endpoints_projectId_idx" ON "webhook_endpoints"("projectId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_publicId_key" ON "webhook_endpoints"("publicId" ASC);

-- AddCheckConstraint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_public_id_contract_format" CHECK ("publicId" ~ '^alr_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_public_id_contract_format" CHECK ("publicId" ~ '^key_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_public_id_contract_format" CHECK ("publicId" ~ '^audit_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "cloud_import_jobs" ADD CONSTRAINT "cloud_import_jobs_public_id_contract_format" CHECK ("publicId" ~ '^imp_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_public_id_contract_format" CHECK ("publicId" ~ '^cmp_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "ingest_hooks" ADD CONSTRAINT "ingest_hooks_public_id_contract_format" CHECK ("publicId" ~ '^dwh_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "invites" ADD CONSTRAINT "invites_public_id_contract_format" CHECK ("publicId" ~ '^inv_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_public_id_contract_format" CHECK ("publicId" ~ '^kw_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_public_id_contract_format" CHECK ("publicId" ~ '^mbr_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "migration_tokens" ADD CONSTRAINT "migration_tokens_public_id_contract_format" CHECK ("publicId" ~ '^ferry_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_public_id_contract_format" CHECK ("publicId" ~ '^ntf_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_public_id_contract_format" CHECK ("publicId" ~ '^pat_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "projects" ADD CONSTRAINT "projects_public_id_contract_format" CHECK ("publicId" ~ '^prj_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_public_id_contract_format" CHECK ("publicId" ~ '^conn_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "rank_check_raw_purge_progress" ADD CONSTRAINT "rank_check_raw_purge_progress_batch_count_check" CHECK ("batchCount" >= 0 AND "batchCount" <= "maxBatches");

-- AddCheckConstraint
ALTER TABLE "rank_check_raw_purge_progress" ADD CONSTRAINT "rank_check_raw_purge_progress_max_batches_check" CHECK ("maxBatches" >= 1 AND "maxBatches" <= 10);

-- AddCheckConstraint
ALTER TABLE "rank_check_raw_purge_progress" ADD CONSTRAINT "rank_check_raw_purge_progress_retention_days_check" CHECK ("retentionDays" IS NULL OR ("retentionDays" >= 1 AND "retentionDays" <= 3650));

-- AddCheckConstraint
ALTER TABLE "rank_check_raw_purge_progress" ADD CONSTRAINT "rank_check_raw_purge_progress_updated_count_check" CHECK ("updatedCount" >= 0);

-- AddCheckConstraint
ALTER TABLE "rank_checks" ADD CONSTRAINT "rank_checks_public_id_contract_format" CHECK ("publicId" ~ '^check_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "saved_keywords" ADD CONSTRAINT "saved_keywords_public_id_contract_format" CHECK ("publicId" ~ '^svkw_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_public_id_contract_format" CHECK ("publicId" ~ '^viw_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_public_id_contract_format" CHECK ("publicId" ~ '^sid_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "signals" ADD CONSTRAINT "signals_public_id_contract_format" CHECK ("publicId" ~ '^sig_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "tags" ADD CONSTRAINT "tags_public_id_contract_format" CHECK ("publicId" ~ '^tag_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "triggered_alerts" ADD CONSTRAINT "triggered_alerts_public_id_contract_format" CHECK ("publicId" ~ '^al_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "users" ADD CONSTRAINT "users_public_id_contract_format" CHECK ("publicId" ~ '^usr_[a-z][a-z0-9]{23}$'::text);

-- AddCheckConstraint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_public_id_contract_format" CHECK ("publicId" ~ '^we_[a-z][a-z0-9]{23}$'::text);

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_daily_stats" ADD CONSTRAINT "alert_rule_daily_stats_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_recipients" ADD CONSTRAINT "alert_rule_recipients_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_recipients" ADD CONSTRAINT "alert_rule_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_targets" ADD CONSTRAINT "alert_rule_targets_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_targets" ADD CONSTRAINT "alert_rule_targets_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rule_targets" ADD CONSTRAINT "alert_rule_targets_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlink_rows" ADD CONSTRAINT "backlink_rows_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "backlink_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlink_snapshots" ADD CONSTRAINT "backlink_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_import_jobs" ADD CONSTRAINT "cloud_import_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cloud_import_jobs" ADD CONSTRAINT "cloud_import_jobs_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "migration_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_triggeredAlertId_fkey" FOREIGN KEY ("triggeredAlertId") REFERENCES "triggered_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_webhookEndpointId_fkey" FOREIGN KEY ("webhookEndpointId") REFERENCES "webhook_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_hooks" ADD CONSTRAINT "ingest_hooks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingest_hooks" ADD CONSTRAINT "ingest_hooks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_dispatch_states" ADD CONSTRAINT "keyword_dispatch_states_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_schedules" ADD CONSTRAINT "keyword_schedules_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_tags" ADD CONSTRAINT "keyword_tags_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_tags" ADD CONSTRAINT "keyword_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_traffic_snapshots" ADD CONSTRAINT "keyword_traffic_snapshots_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_import_chunks" ADD CONSTRAINT "migration_import_chunks_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "cloud_import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_tokens" ADD CONSTRAINT "migration_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_tokens" ADD CONSTRAINT "migration_tokens_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthAccessToken" ADD CONSTRAINT "oauthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthApplication"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthAccessToken" ADD CONSTRAINT "oauthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthAccessTokenV2" ADD CONSTRAINT "oauthAccessTokenV2_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthAccessTokenV2" ADD CONSTRAINT "oauthAccessTokenV2_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES "oauthRefreshToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthAccessTokenV2" ADD CONSTRAINT "oauthAccessTokenV2_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthAccessTokenV2" ADD CONSTRAINT "oauthAccessTokenV2_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthApplication" ADD CONSTRAINT "oauthApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthClient" ADD CONSTRAINT "oauthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthConsent" ADD CONSTRAINT "oauthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthApplication"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthConsent" ADD CONSTRAINT "oauthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthConsentV2" ADD CONSTRAINT "oauthConsentV2_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthConsentV2" ADD CONSTRAINT "oauthConsentV2_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthRefreshToken" ADD CONSTRAINT "oauthRefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthRefreshToken" ADD CONSTRAINT "oauthRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthRefreshToken" ADD CONSTRAINT "oauthRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_traffic_snapshots" ADD CONSTRAINT "page_traffic_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_defaults" ADD CONSTRAINT "project_defaults_locationKey_fkey" FOREIGN KEY ("locationKey") REFERENCES "locations"("canonicalKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_defaults" ADD CONSTRAINT "project_defaults_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_writeModeChangedById_fkey" FOREIGN KEY ("writeModeChangedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_connection_rates" ADD CONSTRAINT "provider_connection_rates_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_cost_entries" ADD CONSTRAINT "provider_cost_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queued_rank_check_batches" ADD CONSTRAINT "queued_rank_check_batches_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "provider_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queued_rank_check_batches" ADD CONSTRAINT "queued_rank_check_batches_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queued_rank_check_tasks" ADD CONSTRAINT "queued_rank_check_tasks_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "queued_rank_check_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queued_rank_check_tasks" ADD CONSTRAINT "queued_rank_check_tasks_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queued_rank_check_tasks" ADD CONSTRAINT "queued_rank_check_tasks_rankCheckId_fkey" FOREIGN KEY ("rankCheckId") REFERENCES "rank_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_checks" ADD CONSTRAINT "rank_checks_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_keywords" ADD CONSTRAINT "saved_keywords_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_snapshots" ADD CONSTRAINT "sitemap_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_connections" ADD CONSTRAINT "slack_connections_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_connections" ADD CONSTRAINT "slack_connections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggered_alerts" ADD CONSTRAINT "triggered_alerts_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggered_alerts" ADD CONSTRAINT "triggered_alerts_rankCheckId_fkey" FOREIGN KEY ("rankCheckId") REFERENCES "rank_checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggered_alerts" ADD CONSTRAINT "triggered_alerts_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twoFactor" ADD CONSTRAINT "twoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "url_presences" ADD CONSTRAINT "url_presences_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
