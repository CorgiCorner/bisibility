import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  aggregateConnectionUsage,
  type UsageCredentialSource,
} from "@/lib/provider-usage/connection-usage";
import { PROVIDER_REQUEST_SOURCES, type ProviderRequestSource } from "@/lib/provider-usage/tag";
import type { ProviderAllocationUnit } from "@/lib/providers/allocation-catalog";
import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { monthUtcRange } from "@/lib/rank-check/budget";

type ConnectionUsage = Awaited<ReturnType<typeof aggregateConnectionUsage>>;

function normalizedSource(value: string | null): ProviderRequestSource | "unknown" {
  return PROVIDER_REQUEST_SOURCES.includes(value as ProviderRequestSource)
    ? (value as ProviderRequestSource)
    : "unknown";
}

/**
 * One month of confirmed provider cost rows bucketed by connection, feature,
 * source and trigger. Confirmed means the measurement settled ("recorded").
 * Rows without a settled status are reported as unrecorded; recorded legacy
 * rows without a measured quantity are reported as unmeasured, so quota
 * consumers can treat them as unconfirmed instead of zero.
 */
export type ProviderCostSourceUsage = {
  connectionId: string;
  /** Settled ("recorded") request rows. */
  count: number;
  /** Confirmed cost sum in cents. */
  costCents: number;
  feature: string;
  /** Confirmed native quantity sum; null when nothing was measured. */
  quantity: number | null;
  /** Confirmed scheduled request rows. */
  scheduled: number;
  source: ProviderRequestSource | "unknown";
  /** Recorded rows without a measured quantity (unconfirmed for quota units). */
  unmeasuredCount: number;
  /** Rows whose measurement has not settled. */
  unrecordedCount: number;
};

function groupKey(row: {
  connectionId: string;
  feature: string;
  source: string | null;
  trigger: string | null;
}) {
  return [row.connectionId, row.feature, row.source, row.trigger].join("\u0000");
}

function mergeSourceUsage(
  confirmed: readonly {
    _count: { _all: number };
    _sum: { costCents: unknown; usageQuantity: unknown };
    connectionId: string;
    feature: string;
    source: string | null;
    trigger: string | null;
  }[],
  unrecorded: readonly {
    _count: { _all: number };
    connectionId: string;
    feature: string;
    source: string | null;
    trigger: string | null;
  }[],
  unmeasured: readonly {
    _count: { _all: number };
    connectionId: string;
    feature: string;
    source: string | null;
    trigger: string | null;
  }[],
): ProviderCostSourceUsage[] {
  const unrecordedByKey = new Map<string, number>(
    unrecorded.map((row) => [groupKey(row), row._count._all]),
  );
  const unmeasuredByKey = new Map<string, number>(
    unmeasured.map((row) => [groupKey(row), row._count._all]),
  );
  const confirmedKeys = new Set(confirmed.map(groupKey));
  const pendingOnly = unrecorded
    .filter((row) => !confirmedKeys.has(groupKey(row)))
    .map((row) => ({
      ...row,
      _count: { _all: 0 },
      _sum: { costCents: 0, usageQuantity: null },
    }));
  return [...confirmed, ...pendingOnly].map((row) => {
    const key = groupKey(row);
    return {
      connectionId: row.connectionId,
      count: row._count._all,
      costCents: Number(row._sum.costCents ?? 0),
      feature: row.feature,
      quantity: row._sum.usageQuantity == null ? null : Number(row._sum.usageQuantity),
      scheduled: row.trigger === "scheduled" ? row._count._all : 0,
      source: normalizedSource(row.source),
      unmeasuredCount: unmeasuredByKey.get(key) ?? 0,
      unrecordedCount: unrecordedByKey.get(key) ?? 0,
    };
  });
}

/** One month of provider cost rows bucketed by connection, feature, source and trigger. */
export async function providerCostBySource(
  projectId: string,
  now = new Date(),
): Promise<ProviderCostSourceUsage[]> {
  const by = ["connectionId", "feature", "source", "trigger"] as const;
  const where = { cached: false, createdAt: monthUtcRange(now), projectId };
  const [confirmed, unrecorded, unmeasured] = await Promise.all([
    prisma.providerCostEntry.groupBy({
      _count: { _all: true },
      _sum: { costCents: true, usageQuantity: true },
      by: [...by],
      where: { ...where, measurementStatus: "recorded" },
    }),
    prisma.providerCostEntry.groupBy({
      _count: { _all: true },
      by: [...by],
      where: { ...where, measurementStatus: { not: "recorded" } },
    }),
    prisma.providerCostEntry.groupBy({
      _count: { _all: true },
      by: [...by],
      where: { ...where, measurementStatus: "recorded", usageQuantity: null },
    }),
  ]);
  return mergeSourceUsage(confirmed, unrecorded, unmeasured);
}

export type SourceSpendUsage = {
  /** This month, both surfaces. */
  current: ConnectionUsage;
  /** Last month, both surfaces. */
  previous: ConnectionUsage;
  surfaces: {
    app: { current: ConnectionUsage };
    programmatic: { current: ConnectionUsage };
  };
};

/** Own keys and credits are loaded apart and never added together. */
export type ProviderSpendUsage = { credits: SourceSpendUsage; own: SourceSpendUsage };

function combinedUsage(left: ConnectionUsage, right: ConnectionUsage): ConnectionUsage {
  return {
    requestCount: left.requestCount + right.requestCount,
    unconfirmedCount: left.unconfirmedCount + right.unconfirmedCount,
    used: left.used + right.used,
  };
}

async function loadSourceUsage(input: {
  connectionId: string;
  credentialSource: UsageCredentialSource;
  now: Date;
  priorMonth: Date;
  projectId: string;
  unit: ProviderAllocationUnit;
}): Promise<SourceSpendUsage> {
  const base = {
    connectionId: input.connectionId,
    credentialSource: input.credentialSource,
    projectId: input.projectId,
    unit: input.unit,
  };
  const [app, programmatic, previous] = await Promise.all([
    aggregateConnectionUsage(prisma, { ...base, now: input.now, surface: "app" }),
    aggregateConnectionUsage(prisma, { ...base, now: input.now, surface: "programmatic" }),
    aggregateConnectionUsage(prisma, { ...base, now: input.priorMonth }),
  ]);
  return {
    current: combinedUsage(app, programmatic),
    previous,
    surfaces: { app: { current: app }, programmatic: { current: programmatic } },
  };
}

export async function loadProviderSpendUsage(input: {
  catalog: readonly ProviderCatalogEntry[];
  connections: readonly { id: string; provider: string }[];
  now: Date;
  projectId: string;
}): Promise<Map<string, ProviderSpendUsage | null>> {
  const priorMonth = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() - 1, 1));
  return new Map(
    await Promise.all(
      input.connections.map(async (connection) => {
        const allocation = input.catalog.find(
          (entry) => entry.id === connection.provider,
        )?.allocation;
        if (allocation?.kind !== "billable") return [connection.id, null] as const;
        const base = {
          connectionId: connection.id,
          now: input.now,
          priorMonth,
          projectId: input.projectId,
          unit: allocation.allocationUnit,
        };
        const [own, credits] = await Promise.all([
          loadSourceUsage({ ...base, credentialSource: "own" }),
          loadSourceUsage({ ...base, credentialSource: "hosted" }),
        ]);
        return [connection.id, { credits, own }] as const;
      }),
    ),
  );
}

/**
 * This month's confirmed spend across every connection, split by who was paid:
 * provider charges on the project's own keys (costCents of own rows) and credits
 * spent (charged priceCents of credits rows). The two are never added together.
 */
export async function recordedSpendBySource(projectId: string, now = new Date()) {
  const groups = await prisma.providerCostEntry.groupBy({
    _sum: { costCents: true, priceCents: true },
    by: ["credentialSource"],
    where: {
      cached: false,
      createdAt: monthUtcRange(now),
      measurementStatus: "recorded",
      projectId,
    },
  });
  let ownCents = 0;
  let creditsCents = 0;
  for (const group of groups) {
    if (group.credentialSource === "hosted") creditsCents += Number(group._sum.priceCents ?? 0);
    else ownCents += Number(group._sum.costCents ?? 0);
  }
  return { creditsCents, ownCents };
}
