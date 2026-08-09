import "server-only";

import { MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY } from "@/lib/alerts/limits";
import { projectedMonthlySpendCents } from "@/lib/cost-estimate/spend-pace";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { centsToDollars } from "@/lib/format/currency";
import { createUserDateTimeFormatter, type DateTimePreferences } from "@/lib/format/user-datetime";
import { DEFAULT_INSPECTION_DAILY_LIMIT } from "@/lib/presence/constants";
import { presenceUrl } from "@/lib/presence/url";
import {
  loadProviderRateContexts,
  providerRateContextKey,
} from "@/lib/provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
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
import {
  normalizeTrackingScope,
  type TrackingScope,
  trackedProjectDomain,
} from "@/lib/schemas/project";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { resolveSerpDepth, resolveSerpStopOnMatch, type SerpDepth } from "@/lib/serp/markets";
import type { ProviderUsageData } from "@/lib/settings/options";
import { requireReadableProject } from "./_auth";
import { apiKeyExpiryLabel } from "./api-key-settings";
import { initials, memberColor, roleLabel } from "./settings-members";
import {
  type SettingsProviderSummary,
  settingsConnectionUsage,
  settingsProviderSummaries,
} from "./settings-provider-summaries";

export type SettingsView = {
  apiKeys: {
    createdLabel: string;
    expiresLabel: string;
    id: string;
    isExpired: boolean;
    lastUsedLabel: string;
    maskedValue: string;
    name: string;
  }[];
  defaults: {
    city: string | null;
    locationKey: string;
    locationLabel: string;
    costPerCheck: number;
    country: string;
    device: string;
    deviceCount: number;
    keywordCount: number;
    inspectionDailyLimit: number;
    locationCount: number;
    serpDepth: SerpDepth;
    serpStopOnMatch: boolean;
    schedule: {
      cron_expression: string | null;
      frequency: "custom_cron" | "daily" | "manual" | "monthly" | "paused" | "weekly";
      jitter_minutes: number;
      last_checked_at: string | null;
      next_check_at: string | null;
      timezone: string;
    };
    targetUrlCount: number;
  };
  notifications: {
    channel: "Email";
    digest: "Daily";
    email: string;
    emailVerification: "unverified" | "verified";
    maxAlertsPerDay: number;
  };
  project: {
    domain: string;
    name: string;
    projectId: string;
    trackingScope: TrackingScope;
    writeMode: "active" | "migration_hold" | "migrated";
  };
  providers: SettingsProviderSummary[];
  tags: { color: string; count: number; label: string }[];
  team: {
    color: "accent" | "blue" | "purple";
    email: string;
    id: string;
    initials: string;
    name: string;
    role: "Editor" | "Owner" | "Viewer";
    userId: string;
  }[];
  usage: ProviderUsageData;
};

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
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
export async function getSettings(projectId: string, options: { now?: Date; preferences?: DateTimePreferences } = {}): Promise<SettingsView> {
  const { project } = await requireReadableProject(projectId);
  const dateTime = createUserDateTimeFormatter(options.preferences);
  const now = options.now ?? new Date();
  const [fullProject, monthChecks, spentCents, connectionLookups] = await Promise.all([
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
    ]);
  if (!fullProject) throw new Error("Project not found.");
  const rateContexts = await loadProviderRateContexts(
    fullProject.providerConnections.map((connection) => connection.id),
    ["rank_check"],
    now,
  );

  const primarySerp = primaryProviderConnection(fullProject.providerConnections, "serp");
  const schedule = fullProject.defaults ?? {
    cronExpression: null,
    frequency: "manual" as const,
    jitterMinutes: 0,
    lastCheckedAt: null,
    nextCheckAt: null,
    timezone: "UTC",
  };
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
      ),
      hasProvider: primarySerp != null,
      onPaceCents: projectedMonthlySpendCents(spentCents, now),
      primaryProvider: primarySerp
        ? (PROVIDER_CATALOG.find((entry) => entry.id === primarySerp.provider)?.label ??
          primarySerp.provider)
        : "-",
      serpChecksMonth: observedUsage.checkCount.toLocaleString("en-US"),
    },
  };
}
