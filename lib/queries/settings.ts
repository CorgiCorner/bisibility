import "server-only";

import { MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY } from "@/lib/alerts/limits";
import { projectedMonthlySpendCents } from "@/lib/cost-estimate/spend-pace";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { centsToDollars } from "@/lib/format/currency";
import { createUserDateTimeFormatter, type DateFormatPreference } from "@/lib/format/user-datetime";
import { DEFAULT_INSPECTION_DAILY_LIMIT } from "@/lib/presence/constants";
import { presenceUrl } from "@/lib/presence/url";
import {
  loadProviderRateContexts,
  providerRateContextKey,
} from "@/lib/provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import {
  monthlyLookupSpendByConnection,
  monthlySpendCents,
  monthUtcRange,
} from "@/lib/rank-check/budget";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { aggregateObservedUsage } from "@/lib/rank-check/observed-usage";
import {
  primaryProviderConnection,
  providerChainOrderBy,
} from "@/lib/rank-check/provider-chain-order";
import { normalizeTrackingScope, trackedProjectDomain } from "@/lib/schemas/project";
import { resolveSearchInsightsConnectionState } from "@/lib/search-insights/connection-state";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { resolveSerpDepth, resolveSerpStopOnMatch } from "@/lib/serp/markets";
import { resolveSearchSyncSettings } from "@/lib/settings/search-sync-config";
import { loadSearchSyncMetrics } from "@/lib/settings/search-sync-metrics";
import { requireReadableProject } from "./_auth";
import { apiKeyExpiryLabel } from "./api-key-settings";
import { loadProviderAvailability } from "./provider-availability";
import { loadProjectProviderSpend } from "./provider-spend";
import { initials, memberColor, roleLabel } from "./settings-members";
import { settingsConnectionUsage, settingsProviderSummaries } from "./settings-provider-summaries";
import type { SettingsView } from "./settings-view-types";

export type { SettingsView } from "./settings-view-types";

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

function usagePeriod(now: Date, dateFormat: DateFormatPreference = "iso") {
  const dateTime = createUserDateTimeFormatter({ dateFormat, timezone: "UTC" });
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const end = new Date(reset.getTime() - 1);
  const resetDays = Math.max(0, Math.floor((reset.getTime() - now.getTime()) / 86_400_000));
  return {
    dateFormat,
    endAt: reset.toISOString(),
    endLabel: dateTime.formatDate(end),
    label: dateTime.formatMonthYear(start),
    now: now.toISOString(),
    resetsLabel:
      resetDays === 0
        ? "resets today"
        : resetDays === 1
          ? "resets in 1 day"
          : `resets in ${resetDays} days`,
    timezone: dateTime.timezone,
  };
}

function requiredPublicId(value: string | null, prefix: "key" | "mbr" | "usr", resource: string) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

// biome-ignore format: compact signature keeps this query under the line cap.
function labelFromDate(prefix: string, date: Date | null | undefined, dateTime: ReturnType<typeof createUserDateTimeFormatter>) {
  if (!date) {
    return `${prefix} never`;
  }
  return `${prefix} ${dateTime.formatDate(date)}`;
}

// biome-ignore format: compact signature keeps this query under the line cap.
export async function getSettings(projectId: string, options: { dateFormat?: DateFormatPreference; now?: Date } = {}): Promise<SettingsView> {
  const { project } = await requireReadableProject(projectId);
  const now = options.now ?? new Date();
  const [fullProject, monthChecks, spentCents, connectionLookups, providerSpend] = await Promise.all([
    prisma.project.findUnique({
      include: {
        // Every key the user may still act on: expired keys stay listed as a state of their
        // own, so this is the unchanged pre-expiry condition. isExpired and expiresLabel are
        // derived per row below.
        apiKeys: { orderBy: { createdAt: "desc" }, where: { revokedAt: null } },
        defaults: true,
        keywords: { select: { device: true, location: true, locationRef: true, targetUrl: true } },
        members: { include: { user: true }, orderBy: { createdAt: "asc" } },
        providerConnections: { orderBy: providerChainOrderBy() },
        tags: { include: { _count: { select: { keywords: true } } }, orderBy: { name: "asc" } },
      },
      where: { id: project.id },
    }),
    prisma.rankCheck.findMany({
      select: { costCents: true, estimatedCostCents: true, provider: true, status: true },
      where: {
        checkedAt: monthUtcRange(now),
        keyword: { projectId: project.id },
        status: { not: "deferred" },
      },
    }),
    monthlySpendCents(project.id, now),
    monthlyLookupSpendByConnection(project.id, now),
    loadProjectProviderSpend({ catalog: PROVIDER_CATALOG, now, projectId: project.id }),
  ]);
  if (!fullProject) throw new Error("Project not found.");
  const gscConnection = fullProject.providerConnections.find((item) => item.provider === "gsc");
  let storedGscProperty: string | undefined;
  try {
    storedGscProperty = gscConnection
      ? decryptProviderCredentials(gscConnection.credentialsEncrypted).login
      : undefined;
  } catch {
    storedGscProperty = undefined;
  }
  const { propertyKey: gscProperty, status: connectionStatus } =
    resolveSearchInsightsConnectionState({
      providerStatus: gscConnection?.status ?? null,
      storedProperty: storedGscProperty,
    });
  const searchSyncSettings = resolveSearchSyncSettings(fullProject.defaults);
  const [rateContexts, providerAvailability, searchSyncMetrics] = await Promise.all([
    loadProviderRateContexts(
      fullProject.providerConnections.map((connection) => connection.id),
      ["rank_check"],
      now,
    ),
    loadProviderAvailability(fullProject.providerConnections),
    loadSearchSyncMetrics(fullProject.id, gscProperty, now),
  ]);

  const primarySerp = primaryProviderConnection(fullProject.providerConnections, "serp");
  const schedule = fullProject.defaults ?? {
    cronExpression: null,
    frequency: "manual" as const,
    jitterMinutes: 0,
    lastCheckedAt: null,
    nextCheckAt: null,
    timezone: "UTC",
  };
  const dateTime = createUserDateTimeFormatter({
    dateFormat: options.dateFormat,
    timezone: schedule.timezone,
  });
  const devices = new Set(fullProject.keywords.map((keyword) => keyword.device));
  const locations = new Set(fullProject.keywords.map((keyword) => keyword.location));
  const targetUrls = new Set(
    fullProject.keywords.flatMap((keyword) => presenceUrl(keyword.targetUrl) ?? []),
  );
  const market = projectDefaultSerpMarket(fullProject.defaults, fullProject.keywords);
  const serpDepth = resolveSerpDepth(fullProject.defaults?.serpDepth);
  const providerCost =
    estimatedRankCheckCostCents(
      primarySerp?.provider,
      serpDepth,
      primarySerp?.costPerCheckCents,
      primarySerp
        ? (rateContexts.get(providerRateContextKey(primarySerp.id, "rank_check")) ??
          LIST_PROVIDER_RATE_CONTEXT)
        : LIST_PROVIDER_RATE_CONTEXT,
    ) ?? 0;
  const completedMonthChecks = monthChecks.filter((check) => check.status === "completed");
  const observedUsage = aggregateObservedUsage(completedMonthChecks);
  return {
    apiKeys: fullProject.apiKeys.map((apiKey) => ({
      createdLabel: labelFromDate("created", apiKey.createdAt, dateTime),
      expiresLabel: apiKeyExpiryLabel(apiKey.expiresAt, now, dateTime),
      id: requiredPublicId(apiKey.publicId, "key", "API key"),
      isExpired: Boolean(apiKey.expiresAt && apiKey.expiresAt <= now),
      lastUsedLabel: labelFromDate("last used", apiKey.lastUsedAt, dateTime),
      maskedValue: `${apiKey.prefix}******`,
      name: apiKey.name,
    })),
    defaults: {
      city: market.city,
      costPerCheck: centsToDollars(providerCost),
      country: market.country,
      device: market.device === "mobile" ? "Mobile" : "Desktop",
      deviceCount: devices.size || 1,
      keywordCount: fullProject.keywords.length,
      inspectionDailyLimit:
        fullProject.defaults?.inspectionDailyLimit ?? DEFAULT_INSPECTION_DAILY_LIMIT,
      searchSync: {
        ...searchSyncMetrics,
        connectionStatus,
        lastQuotaPausedAt: searchSyncMetrics.lastQuotaPausedAt ? dateTime.formatDateTime(searchSyncMetrics.lastQuotaPausedAt) : null,
        lastActivityAt: iso(searchSyncMetrics.lastActivityAt),
        pauseStartedAt: iso(searchSyncMetrics.pauseStartedAt),
        ...searchSyncSettings,
      },
      locationKey: market.locationKey,
      locationLabel: market.displayName,
      locationCount: locations.size || 1,
      serpDepth,
      serpStopOnMatch: resolveSerpStopOnMatch(fullProject.defaults?.serpStopOnMatch),
      schedule: {
        cron_expression: schedule.cronExpression,
        frequency: schedule.frequency,
        jitter_minutes: schedule.jitterMinutes,
        last_checked_at: iso(schedule.lastCheckedAt),
        next_check_at: iso(schedule.nextCheckAt),
        timezone: schedule.timezone,
      },
      targetUrlCount: targetUrls.size,
    },
    notifications: {
      channel: "Email",
      digest: "Daily",
      email: fullProject.members[0]?.user.email ?? "",
      emailVerification: fullProject.members[0]?.user.emailVerified ? "verified" : "unverified",
      maxAlertsPerDay: MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY,
    },
    project: {
      domain: trackedProjectDomain(fullProject.domain) ?? "",
      name: fullProject.name,
      projectId: fullProject.publicId,
      trackingScope: normalizeTrackingScope(fullProject.trackingScope),
      writeMode: fullProject.writeMode,
    },
    providers: settingsProviderSummaries(fullProject.providerConnections, completedMonthChecks),
    tags: fullProject.tags.map((tag) => ({
      color: tag.color ?? "var(--blue)",
      count: tag._count.keywords,
      label: tag.name,
    })),
    team: fullProject.members.map((member, index) => ({
      color: memberColor(index),
      email: member.user.email,
      id: requiredPublicId(member.publicId, "mbr", "Membership"),
      initials: initials(member.user.name),
      name: member.user.name,
      role: roleLabel(member.role),
      userId: requiredPublicId(member.user.publicId, "usr", "User"),
    })),
    usage: {
      budget: { capCents: fullProject.budgetCapCents, spentCents },
      connections: settingsConnectionUsage(
        fullProject.providerConnections,
        monthChecks,
        connectionLookups,
        serpDepth,
        rateContexts,
        providerAvailability,
      ),
      providerSpend,
      hasProvider: primarySerp != null,
      onPaceCents: projectedMonthlySpendCents(spentCents, now),
      period: usagePeriod(now, options.dateFormat),
      primaryProvider: primarySerp
        ? (PROVIDER_CATALOG.find((entry) => entry.id === primarySerp.provider)?.label ??
          primarySerp.provider)
        : "-",
      serpChecksMonth: observedUsage.checkCount.toLocaleString("en-US"),
    },
  };
}
