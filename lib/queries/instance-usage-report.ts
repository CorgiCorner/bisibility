import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { canonicalUsageSql } from "@/lib/metering/usage-sql";
import type { InstanceUsagePeriod } from "./instance-usage-period";

export type { InstanceUsagePeriod } from "./instance-usage-period";
export type InstanceUsageTotals = {
  operations: number;
  recordedOperations: number;
  unknownOperations: number;
  costUsdUnits: string | null;
};
export type InstanceProviderUsage = InstanceUsageTotals & { provider: string };
export type InstanceProjectUsage = InstanceProviderUsage & {
  projectId: string | null;
  sharePercent: number | null;
};
export type InstanceUsageReport = {
  period: InstanceUsagePeriod;
  from: string | null;
  to: string;
  totals: InstanceUsageTotals;
  providers: InstanceProviderUsage[];
  topProjects: InstanceProjectUsage[];
};
type RawRow = {
  kind: "total" | "provider" | "project";
  provider: string | null;
  projectId: string | null;
  operations: string;
  recordedOperations: string;
  unknownOperations: string;
  costUsdUnits: string | null;
};

function window(period: InstanceUsagePeriod, now: Date) {
  return {
    from:
      period === "month" ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) : null,
    to: new Date(now.getTime() + 1),
  };
}

const aggregateColumns = SQL.sql`count(*)::text AS operations,
  count("costCents")::text AS "recordedOperations",
  count(*) FILTER(WHERE "costCents" IS NULL)::text AS "unknownOperations",
  CASE WHEN count(*)=0 THEN '0'
    ELSE (sum("costCents")*10000)::numeric(38,0)::text END AS "costUsdUnits"`;

/** Aggregate every effective sent operation before bounding only the project ranking. */
export function instanceUsageSql(namespace: string, period: InstanceUsagePeriod, now: Date) {
  const range = window(period, now);
  return SQL.sql`WITH usage AS (
    SELECT * FROM (${canonicalUsageSql(namespace)}) ledger
    WHERE state IN ('settled','dispatch_intended') AND "createdAt"<${range.to}
      ${range.from ? SQL.sql`AND "createdAt">=${range.from}` : SQL.empty}
  ), totals AS (
    SELECT 'total'::text AS kind,NULL::text AS provider,NULL::text AS "projectId",${aggregateColumns} FROM usage
  ), providers AS (
    SELECT 'provider'::text AS kind,provider,NULL::text AS "projectId",${aggregateColumns}
    FROM usage GROUP BY provider ORDER BY provider
  ), projects AS (
    SELECT 'project'::text AS kind,provider,"projectId",${aggregateColumns}
    FROM usage GROUP BY provider,"projectId"
    ORDER BY sum("costCents") DESC NULLS LAST,provider,"projectId" NULLS LAST LIMIT 10
  ) SELECT * FROM totals UNION ALL SELECT * FROM providers UNION ALL SELECT * FROM projects`;
}

function totals(row: RawRow): InstanceUsageTotals {
  const counts = [row.operations, row.recordedOperations, row.unknownOperations].map(Number);
  if (
    !counts.every((n) => Number.isSafeInteger(n) && n >= 0) ||
    counts[0] !== counts[1] + counts[2]
  )
    throw new Error("Instance usage counts unavailable");
  if (row.costUsdUnits !== null && !/^\d+$/.test(row.costUsdUnits))
    throw new Error("Instance usage amount unavailable");
  return {
    operations: counts[0],
    recordedOperations: counts[1],
    unknownOperations: counts[2],
    costUsdUnits: row.costUsdUnits,
  };
}

export async function readInstanceUsageReport(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  namespace: string,
  period: InstanceUsagePeriod,
  now: Date,
): Promise<InstanceUsageReport> {
  const rows = await tx.$queryRaw<RawRow[]>(instanceUsageSql(namespace, period, now));
  const total = rows.find((row) => row.kind === "total");
  if (!total) throw new Error("Instance usage unavailable");
  const instance = totals(total);
  const denominator = BigInt(instance.costUsdUnits ?? "0");
  const range = window(period, now);
  return {
    period,
    from: range.from?.toISOString() ?? null,
    to: range.to.toISOString(),
    totals: instance,
    providers: rows
      .filter((row) => row.kind === "provider")
      .map((row) => ({ ...totals(row), provider: row.provider ?? "unknown" })),
    topProjects: rows
      .filter((row) => row.kind === "project")
      .map((row) => ({
        ...totals(row),
        provider: row.provider ?? "unknown",
        projectId: row.projectId,
        sharePercent:
          row.costUsdUnits !== null && denominator > 0n
            ? Number((BigInt(row.costUsdUnits) * 10000n) / denominator) / 100
            : null,
      })),
  };
}

export async function getInstanceUsageReport(
  period: InstanceUsagePeriod,
  now: Date,
): Promise<InstanceUsageReport | null> {
  try {
    return await readInstanceUsageReport(prisma, meteringNamespace(), period, now);
  } catch {
    return null;
  }
}
