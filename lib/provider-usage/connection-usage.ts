import { Prisma } from "@/lib/generated/prisma/client";
import type { UsageReadClient } from "@/lib/metering/usage-read";
import { canonicalUsageSql } from "@/lib/metering/usage-sql";
import { monthUtcRange } from "@/lib/metering/utc-window";
import type { ProviderAllocationUnit } from "@/lib/providers/allocation-catalog";
import type { ProviderRequestSurface } from "./surface";

export type ConnectionUsageClient = Partial<UsageReadClient>;
export type UsageCredentialSource = "own" | "hosted";
export type ConnectionUsage = { requestCount: number; unconfirmedCount: number; used: number };

/** Actuals are effective Store measurements, with unknown coverage counted independently. */
export async function aggregateConnectionUsage(
  db: ConnectionUsageClient,
  input: {
    connectionId: string;
    credentialSource: UsageCredentialSource;
    now?: Date;
    projectId: string;
    surface?: ProviderRequestSurface;
    unit: ProviderAllocationUnit;
  },
): Promise<ConnectionUsage> {
  if (!db.$queryRaw) throw new Error("Canonical usage reader is unavailable");
  const range = monthUtcRange(input.now);
  const column = Prisma.raw(
    input.credentialSource === "hosted"
      ? '"priceCents"'
      : input.unit === "units"
        ? '"usageQuantity"'
        : '"costCents"',
  );
  const [row] = await db.$queryRaw<
    { requestCount: number; unconfirmedCount: number; used: unknown }[]
  >(Prisma.sql`
    SELECT COUNT(*)::int AS "requestCount",COUNT(*) FILTER(WHERE ${column} IS NULL)::int AS "unconfirmedCount",
      COALESCE(SUM(${column}),0) AS used FROM (${canonicalUsageSql()}) u
    WHERE "projectId"=${input.projectId} AND "connectionId"=${input.connectionId}
      AND "credentialSource"=${input.credentialSource} AND NOT cached
      AND "createdAt">=${range.gte} AND "createdAt"<${range.lt}
      ${input.surface ? Prisma.sql`AND surface=${input.surface}` : Prisma.empty}`);
  return {
    requestCount: row?.requestCount ?? 0,
    unconfirmedCount: row?.unconfirmedCount ?? 0,
    used: Number(row?.used ?? 0),
  };
}

/** Preserves the advisory stale/failed distinction while removing its legacy ledger read. */
export async function unresolvedConnectionUsage(
  db: ConnectionUsageClient,
  input: {
    connectionId: string;
    projectId: string;
    credentialSource: UsageCredentialSource;
    unit: ProviderAllocationUnit;
    surface: ProviderRequestSurface;
    now?: Date;
  },
) {
  if (!db.$queryRaw) throw new Error("Canonical usage reader is unavailable");
  const range = monthUtcRange(input.now);
  const staleBefore = new Date((input.now ?? new Date()).getTime() - 15 * 60_000);
  const [row] = await db.$queryRaw<
    { count: number }[]
  >(Prisma.sql`SELECT COUNT(*)::int AS count FROM (${canonicalUsageSql()}) u
    WHERE "projectId"=${input.projectId} AND "connectionId"=${input.connectionId} AND "credentialSource"=${input.credentialSource}
      AND NOT cached AND surface=${input.surface} AND "createdAt">=${range.gte} AND "createdAt"<${range.lt}
      AND (("measurementStatus"<>'recorded' AND (failed OR "createdAt"<${staleBefore}))
        OR ("measurementStatus"='recorded' AND ${input.credentialSource === "hosted" ? Prisma.sql`"priceCents" IS NULL` : input.unit === "units" ? Prisma.sql`"usageQuantity" IS NULL` : Prisma.sql`false`}))`);
  return row?.count ?? 0;
}
