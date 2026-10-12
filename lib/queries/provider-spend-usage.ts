import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { canonicalUsageSql } from "@/lib/metering/usage-sql";
import { monthUtcRange } from "@/lib/metering/utc-window";
import {
  aggregateConnectionUsage,
  type UsageCredentialSource,
} from "@/lib/provider-usage/connection-usage";
import { PROVIDER_REQUEST_SOURCES, type ProviderRequestSource } from "@/lib/provider-usage/tag";
import type { ProviderAllocationUnit } from "@/lib/providers/allocation-catalog";
import type { ProviderCatalogEntry } from "@/lib/providers/types";

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

/** Counts paid operations once and groups only their effective Store receipts. */
export async function providerCostBySource(
  projectId: string,
  now = new Date(),
): Promise<ProviderCostSourceUsage[]> {
  const range = monthUtcRange(now);
  const rows = await prisma.$queryRaw<Array<ProviderCostSourceUsage>>(Prisma.sql`
    SELECT "connectionId",feature,source,
      COUNT(*) FILTER(WHERE "costCents" IS NOT NULL)::int AS count,
      COALESCE(SUM("costCents"),0) AS "costCents",
      SUM("usageQuantity") FILTER(WHERE "costCents" IS NOT NULL) AS quantity,
      COUNT(*) FILTER(WHERE "costCents" IS NOT NULL AND trigger='scheduled')::int AS scheduled,
      COUNT(*) FILTER(WHERE "costCents" IS NULL)::int AS "unrecordedCount",
      COUNT(*) FILTER(WHERE "costCents" IS NOT NULL AND "usageQuantity" IS NULL)::int AS "unmeasuredCount"
    FROM (${canonicalUsageSql()}) u WHERE "projectId"=${projectId} AND NOT cached
      AND "createdAt">=${range.gte} AND "createdAt"<${range.lt}
    GROUP BY "connectionId",feature,source`);
  return rows.map((row) => ({
    ...row,
    source: normalizedSource(row.source),
    costCents: Number(row.costCents),
    quantity: row.quantity == null ? null : Number(row.quantity),
  }));
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
  const range = monthUtcRange(now);
  const [row] = await prisma.$queryRaw<{ ownCents: unknown; creditsCents: unknown }[]>(Prisma.sql`
    SELECT COALESCE(SUM("costCents") FILTER(WHERE "credentialSource"='own'),0) AS "ownCents",
      COALESCE(SUM("priceCents") FILTER(WHERE "credentialSource"='hosted'),0) AS "creditsCents"
    FROM (${canonicalUsageSql()}) u WHERE "projectId"=${projectId} AND NOT cached
      AND "createdAt">=${range.gte} AND "createdAt"<${range.lt}`);
  return { ownCents: Number(row?.ownCents ?? 0), creditsCents: Number(row?.creditsCents ?? 0) };
}
