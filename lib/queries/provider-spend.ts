import "server-only";

import { projectedMonthlySpendCents } from "@/lib/cost-estimate/spend-pace";
import { prisma } from "@/lib/db/prisma";
import { resolveEffectiveAllocations } from "@/lib/provider-allocations/compatibility";
import { loadProviderRateContexts } from "@/lib/provider-rates/connection-context";
import type { ProviderCatalogEntry, ProviderStatus } from "@/lib/providers/types";
import {
  monthlyLookupSpendByConnection,
  monthStartUtc,
  monthUtcRange,
} from "@/lib/rank-check/budget";
import {
  primaryProviderConnection,
  providerChainOrderBy,
} from "@/lib/rank-check/provider-chain-order";
import { resolveSerpDepth } from "@/lib/serp/markets";
import type { ProviderAvailabilityData, ProviderUsageStat } from "@/lib/settings/options";
import { loadProviderAvailability } from "./provider-availability";
import { loadProviderSpendUsage } from "./provider-spend-usage";
import { settingsConnectionUsage } from "./settings-provider-summaries";
import { getRequestMonthlySpendCents } from "./workspace-request-data";

export type ProviderSpendConnection = {
  allocation: { amountPerMonth: number; unit: "cents" | "units" } | null;
  allocationSource: "connection" | "legacy_project" | "none";
  availableAtProvider?: ProviderAvailabilityData;
  billing: "metered" | "quota";
  connectionId: string;
  enabled: boolean;
  features: ProviderUsageStat[];
  primary: boolean;
  projectedExhaustionAt: string | null;
  provider: string;
  providerId: string;
  quotaReset: "billing_cycle" | "calendar_month" | "none";
  remaining: number | null;
  requestCount: number;
  state: "ok" | "capped" | "fallback_active" | "top_up_required" | "no_allocation";
  status: ProviderStatus;
  unit: "cents" | "units";
  used: number;
  usedPercent: number | null;
  usedPriorMonth: number;
};

export type ProviderSpendSummary = {
  attention: ProviderSpendConnection["connectionId"][];
  maxUsedPercent: number | null;
  period: { daysUntilReset: number; endsAt: string; monthLabel: string; startsAt: string };
  projected:
    | { kind: "within_limits" }
    | { at: string; kind: "cap_by"; provider: string }
    | { kind: "no_usage" };
  recorded: { cents: number; units: number };
  requestCount: number;
  tightest: { connectionId: string; provider: string; usedPercent: number } | null;
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function monthLabel(date: Date) {
  return `${MONTH_LABELS[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

export type ProjectProviderSpend = {
  connections: ProviderSpendConnection[];
  summary: ProviderSpendSummary;
};

function projectedExhaustionAt(
  allocation: { amountPerMonth: number; unit: "cents" | "units" } | null,
  used: number,
  now: Date,
) {
  if (!allocation || used <= 0) return null;
  const projected = projectedMonthlySpendCents(used, now);
  if (projected === null || projected <= allocation.amountPerMonth) return null;

  const elapsedDays = now.getUTCDate();
  const monthlyStart = monthStartUtc(now);
  const exhaustion = new Date(
    monthlyStart.getTime() + (allocation.amountPerMonth * elapsedDays * 86_400_000) / used,
  );
  return exhaustion.toISOString();
}

function providerLabel(catalog: readonly ProviderCatalogEntry[], providerId: string) {
  return catalog.find((entry) => entry.id === providerId)?.label ?? providerId;
}

function isAttention(
  state: ProviderSpendConnection["state"],
): state is "capped" | "fallback_active" | "top_up_required" {
  return state === "capped" || state === "fallback_active" || state === "top_up_required";
}

export async function loadProjectProviderSpend(input: {
  catalog: readonly ProviderCatalogEntry[];
  now: Date;
  projectId: string;
}): Promise<ProjectProviderSpend> {
  const project = await prisma.project.findUnique({
    select: {
      budgetCapCents: true,
      defaults: { select: { serpDepth: true } },
      providerAllocationsInitializedAt: true,
      providerConnections: { orderBy: providerChainOrderBy() },
    },
    where: { id: input.projectId },
  });
  if (!project) throw new Error("Project not found.");

  const connections = project.providerConnections;
  const allocationConnections = connections.filter(
    (connection) =>
      input.catalog.find((entry) => entry.id === connection.provider)?.allocation !== undefined,
  );
  const billableConnections = allocationConnections.filter(
    (connection) =>
      input.catalog.find((entry) => entry.id === connection.provider)?.allocation?.kind ===
      "billable",
  );
  const [availability, rateContexts, rankChecks, lookups, recordedCents] = await Promise.all([
    loadProviderAvailability(connections),
    loadProviderRateContexts(
      connections.map((connection) => connection.id),
      ["rank_check"],
      input.now,
    ),
    prisma.rankCheck.findMany({
      select: { costCents: true, estimatedCostCents: true, provider: true, status: true },
      where: {
        checkedAt: monthUtcRange(input.now),
        keyword: { projectId: input.projectId },
        status: { not: "deferred" },
      },
    }),
    monthlyLookupSpendByConnection(input.projectId, input.now),
    getRequestMonthlySpendCents(input.projectId, input.now),
  ]);
  const featureByConnection = new Map(
    settingsConnectionUsage(
      connections,
      rankChecks,
      lookups,
      resolveSerpDepth(project.defaults?.serpDepth),
      rateContexts,
      availability,
    ).map((connection) => [connection.connectionId, [...connection.features]]),
  );
  const allocations = new Map(
    resolveEffectiveAllocations({
      catalog: input.catalog,
      connections: allocationConnections,
      project,
    }).map((resolved) => [resolved.internalConnectionId, resolved]),
  );
  const usage = await loadProviderSpendUsage({
    catalog: input.catalog,
    connections: billableConnections,
    now: input.now,
    projectId: input.projectId,
  });
  const primaryConnectionId = primaryProviderConnection(connections, "serp")?.id ?? null;
  const initial = billableConnections.map((connection) => {
    const metadata = input.catalog.find((entry) => entry.id === connection.provider)?.allocation;
    if (metadata?.kind !== "billable") throw new Error("Provider catalog is incomplete.");
    const resolved = allocations.get(connection.id);
    const allocation = resolved?.allocation ?? null;
    const connectionUsage = usage.get(connection.id);
    const used = connectionUsage?.current.used ?? 0;
    const usedPriorMonth = connectionUsage?.previous.used ?? 0;
    const usedPercent = allocation ? Math.min(100, (used / allocation.amountPerMonth) * 100) : null;
    const availableAtProvider = availability.get(connection.id) ?? undefined;
    return {
      allocation,
      allocationSource: resolved?.source ?? "none",
      ...(availableAtProvider ? { availableAtProvider } : {}),
      billing: metadata.billing,
      connectionId: connection.publicId,
      enabled: connection.enabled,
      features: featureByConnection.get(connection.publicId) ?? [],
      primary: connection.id === primaryConnectionId,
      projectedExhaustionAt: projectedExhaustionAt(allocation, used, input.now),
      provider: providerLabel(input.catalog, connection.provider),
      providerId: connection.provider,
      quotaReset: metadata.quotaReset,
      remaining: allocation ? allocation.amountPerMonth - used : null,
      requestCount: connectionUsage?.current.requestCount ?? 0,
      status: connection.status,
      unit: metadata.allocationUnit,
      used,
      usedPercent,
      usedPriorMonth,
    };
  });
  const connectionsWithStates: ProviderSpendConnection[] = initial.map((connection) => {
    const capped = connection.usedPercent !== null && connection.usedPercent >= 100;
    const fallbackAvailable = initial.some(
      (candidate) =>
        candidate.connectionId !== connection.connectionId &&
        candidate.enabled &&
        candidate.status === "connected" &&
        (candidate.usedPercent === null || candidate.usedPercent < 100),
    );
    const topUpRequired =
      connection.availableAtProvider?.status === "available" &&
      connection.availableAtProvider.amount <= 0;
    return {
      ...connection,
      state: capped
        ? fallbackAvailable
          ? "fallback_active"
          : "capped"
        : topUpRequired
          ? "top_up_required"
          : connection.allocation
            ? "ok"
            : "no_allocation",
    };
  });
  connectionsWithStates.sort((left, right) => {
    const attention = Number(isAttention(right.state)) - Number(isAttention(left.state));
    if (attention) return attention;
    const usage = (right.usedPercent ?? -1) - (left.usedPercent ?? -1);
    if (usage) return usage;
    return left.provider.localeCompare(right.provider);
  });

  const allocated = connectionsWithStates.filter(
    (connection): connection is ProviderSpendConnection & { usedPercent: number } =>
      connection.usedPercent !== null,
  );
  const tightest = [...allocated].sort(
    (left, right) =>
      right.usedPercent - left.usedPercent || left.provider.localeCompare(right.provider),
  )[0];
  const exhaustion = connectionsWithStates
    .filter((connection) => connection.projectedExhaustionAt !== null)
    .sort((left, right) =>
      (left.projectedExhaustionAt ?? "").localeCompare(right.projectedExhaustionAt ?? ""),
    )[0];
  const monthEnd = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() + 1, 1));
  const monthStart = monthStartUtc(input.now);

  return {
    connections: connectionsWithStates,
    summary: {
      attention: connectionsWithStates
        .filter((connection) => isAttention(connection.state))
        .map((connection) => connection.connectionId),
      maxUsedPercent: tightest?.usedPercent ?? null,
      period: {
        daysUntilReset: Math.max(
          0,
          Math.floor((monthEnd.getTime() - input.now.getTime()) / 86_400_000),
        ),
        endsAt: monthEnd.toISOString(),
        monthLabel: monthLabel(monthStart),
        startsAt: monthStart.toISOString(),
      },
      projected: connectionsWithStates.every((connection) => connection.used === 0)
        ? { kind: "no_usage" }
        : exhaustion
          ? {
              at: exhaustion.projectedExhaustionAt as string,
              kind: "cap_by",
              provider: exhaustion.provider,
            }
          : { kind: "within_limits" },
      recorded: {
        cents: recordedCents,
        units: connectionsWithStates
          .filter((connection) => connection.unit === "units")
          .reduce((sum, connection) => sum + connection.used, 0),
      },
      requestCount: connectionsWithStates.reduce(
        (sum, connection) => sum + connection.requestCount,
        0,
      ),
      tightest: tightest
        ? {
            connectionId: tightest.connectionId,
            provider: tightest.provider,
            usedPercent: tightest.usedPercent,
          }
        : null,
    },
  };
}
