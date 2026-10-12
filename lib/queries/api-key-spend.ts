import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { UsageReadClient } from "@/lib/metering/usage-read";
import { canonicalUsageSql } from "@/lib/metering/usage-sql";
import { monthUtcRange } from "@/lib/metering/utc-window";

export async function monthlySpendByApiKey(
  projectId: string,
  now = new Date(),
  options: { client?: UsageReadClient } = {},
): Promise<Map<string, number>> {
  const range = monthUtcRange(now);
  const rows = await (options.client ?? prisma).$queryRaw<
    { credentialId: string; total: unknown }[]
  >(Prisma.sql`
    SELECT "credentialId",COALESCE(SUM("budgetCents"),0) AS total FROM (${canonicalUsageSql()}) u
    WHERE "projectId"=${projectId} AND NOT cached AND "credentialKind"='project_key'
      AND "credentialId" IS NOT NULL AND "createdAt">=${range.gte} AND "createdAt"<${range.lt}
    GROUP BY "credentialId"`);
  return new Map(rows.map((row) => [row.credentialId, Number(row.total)]));
}
