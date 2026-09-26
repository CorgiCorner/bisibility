import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveEffectiveAllocations } from "@/lib/provider-allocations/compatibility";
import { loadProviderRateContexts } from "@/lib/provider-rates/connection-context";
import { providerUsageFreshness } from "@/lib/provider-usage/usage-freshness";
import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { monthStartUtc, monthUtcRange } from "@/lib/rank-check/budget";
import {
  primaryProviderConnection,
  providerChainOrderBy,
} from "@/lib/rank-check/provider-chain-order";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { loadProviderAvailability } from "./provider-availability";
import {
  monthLabel,
  surfaceSpend,
  surfaceTightestEntries,
  worseSurfaceState,
} from "./provider-spend-surfaces";
import {
  loadProviderSpendUsage,
  providerCostBySource,
  recordedSpendBySource,
  type SourceSpendUsage,
} from "./provider-spend-usage";
import { settingsConnectionUsage } from "./settings-provider-summaries";

export type {
  ProjectProviderSpend,
  ProviderSpendConnection,
  ProviderSpendSummary,
} from "./provider-spend-types";

import type {
  ProjectProviderSpend,
  ProviderSpendConnection,
  ProviderSpendSourceBlock,
} from "./provider-spend-types";

function providerLabel(catalog: readonly ProviderCatalogEntry[], providerId: string) {
  return catalog.find((entry) => entry.id === providerId)?.label ?? providerId;
}

function sourceBlock(input: {
  allocations: {
    app: ProviderSpendSourceBlock["surfaces"]["app"]["allocation"];
    programmatic: ProviderSpendSourceBlock["surfaces"]["app"]["allocation"];
  };
  now: Date;
  unit: ProviderSpendSourceBlock["unit"];
  usage: SourceSpendUsage | undefined;
}): ProviderSpendSourceBlock {
  const surface = (name: "app" | "programmatic") => {
    const current = input.usage?.surfaces[name].current;
    return surfaceSpend({
      allocation: input.allocations[name],
      now: input.now,
      requestCount: current?.requestCount ?? 0,
      unconfirmedCount: current?.unconfirmedCount ?? 0,
      used: current?.used ?? 0,
    });
  };
  return {
    requestCount: input.usage?.current.requestCount ?? 0,
    surfaces: { app: surface("app"), programmatic: surface("programmatic") },
    unconfirmedCount: input.usage?.current.unconfirmedCount ?? 0,
    unit: input.unit,
    used: input.usage?.current.used ?? 0,
    usedPriorMonth: input.usage?.previous.used ?? 0,
  };
}

function isAttention(
  state: ProviderSpendConnection["state"],
): state is "capped" | "fallback_active" | "top_up_required" {
  return state === "capped" || state === "fallback_active" || state === "top_up_required";
}

export async function loadProjectProviderSpend(input: {
  refreshConnectionPublicId?: string;
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
  const [availability, rateContexts, rankChecks, sourceUsage, recordedSpend, reconciliation] =
    await Promise.all([
      // A provider-side balance only exists for the project's own keys; connections on
      // credits have no stored keys and never query the provider.
      loadProviderAvailability(
        connections.filter((connection) => connection.credentialSource !== "hosted"),
        connections.find((connection) => connection.publicId === input.refreshConnectionPublicId)
          ?.id,
      ),
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
      providerCostBySource(input.projectId, input.now),
      recordedSpendBySource(input.projectId, input.now),
      providerUsageFreshness(prisma, { now: input.now }),
    ]);
  const featureByConnection = new Map(
    settingsConnectionUsage(
      connections,
      rankChecks,
      resolveSerpDepth(project.defaults?.serpDepth),
      rateContexts,
      availability,
      sourceUsage,
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
    const connectionUsage = usage.get(connection.id);
    const own = sourceBlock({
      allocations: {
        app: resolved?.allocation ?? null,
        programmatic: resolved?.programmaticAllocation ?? null,
      },
      now: input.now,
      unit: metadata.allocationUnit,
      usage: connectionUsage?.own,
    });
    const credits = sourceBlock({
      allocations: resolved?.credits ?? { app: null, programmatic: null },
      now: input.now,
      unit: "cents",
      usage: connectionUsage?.credits,
    });
    const credentialSource = connection.credentialSource;
    const active = credentialSource === "hosted" ? credits : own;
    const allocation = active.surfaces.app.allocation;
    const used = active.surfaces.app.used;
    const availableAtProvider =
      credentialSource === "hosted" ? undefined : (availability.get(connection.id) ?? undefined);
    return {
      allocation,
      allocationSource: resolved?.source ?? "none",
      ...(availableAtProvider ? { availableAtProvider } : {}),
      billing: metadata.billing,
      reconciliation,
      connectionId: connection.publicId,
      credentialSource,
      credits,
      enabled: connection.enabled,
      features: featureByConnection.get(connection.publicId) ?? [],
      own,
      primary: connection.id === primaryConnectionId,
      programmaticAllocation: active.surfaces.programmatic.allocation,
      projectedExhaustionAt: active.surfaces.app.projectedExhaustionAt,
      provider: providerLabel(input.catalog, connection.provider),
      providerId: connection.provider,
      quotaReset: metadata.quotaReset,
      remaining: active.surfaces.app.remaining,
      requestCount: active.requestCount,
      unconfirmedCount: active.unconfirmedCount,
      status: connection.status,
      surfaces: active.surfaces,
      unit: active.unit,
      used,
      usedPercent: active.surfaces.app.usedPercent,
      usedPriorMonth: active.usedPriorMonth,
    };
  });
  const connectionsWithStates: ProviderSpendConnection[] = initial.map((connection) => {
    const base = worseSurfaceState(connection.surfaces);
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
      state:
        base === "capped"
          ? fallbackAvailable
            ? "fallback_active"
            : "capped"
          : topUpRequired
            ? "top_up_required"
            : base,
    };
  });
  connectionsWithStates.sort((left, right) => {
    const attention = Number(isAttention(right.state)) - Number(isAttention(left.state));
    if (attention) return attention;
    const usage = (right.usedPercent ?? -1) - (left.usedPercent ?? -1);
    if (usage) return usage;
    return left.provider.localeCompare(right.provider);
  });

  // Budgets are compared per source; only the source a connection runs on today can
  // block it, so the inactive source never becomes the tightest budget.
  const allocated = connectionsWithStates.flatMap((connection) =>
    surfaceTightestEntries(
      connection,
      connection.credentialSource === "hosted" ? "credits" : "own",
    ),
  );
  const tightest = [...allocated].sort(
    (left, right) =>
      right.usedPercent - left.usedPercent ||
      left.provider.localeCompare(right.provider) ||
      left.surface.localeCompare(right.surface),
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
      projected: connectionsWithStates.every(
        (connection) => connection.own.used === 0 && connection.credits.used === 0,
      )
        ? { kind: "no_usage" }
        : exhaustion
          ? {
              at: exhaustion.projectedExhaustionAt as string,
              kind: "cap_by",
              provider: exhaustion.provider,
            }
          : { kind: "within_limits" },
      recorded: {
        cents: recordedSpend.ownCents,
        creditsCents: recordedSpend.creditsCents,
        units: connectionsWithStates
          .filter((connection) => connection.own.unit === "units")
          .reduce((sum, connection) => sum + connection.own.used, 0),
      },
      requestCount: connectionsWithStates.reduce(
        (sum, connection) => sum + connection.own.requestCount + connection.credits.requestCount,
        0,
      ),
      tightest: tightest ?? null,
    },
  };
}
