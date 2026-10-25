import "server-only";
import type { DeferredGroup, DeferredReason } from "@/lib/checks/contract";
import {
  buildProviderHealth,
  type CheckRunsSummary,
  type ProviderChainEntry,
} from "@/lib/checks/runs-view";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { canonicalUsageSql } from "@/lib/metering/usage-sql";
import { projectionCounts } from "@/lib/provider-evidence/projection/model";
import { readCheckEvidence } from "@/lib/provider-evidence/projection/read";

const reasons: readonly string[] = [
  "budget_exhausted",
  "migration_hold",
  "no_provider",
  "rate_limited",
] satisfies DeferredReason[];
type DeferredSource = {
  deferredReason: string | null;
  checkedAt: Date;
  keywordId: string;
  status: string;
};
/** Every raw reason, including an unknown or null one, remains countable. */
export function deferredGroups(rows: readonly DeferredSource[]): DeferredGroup[] {
  const groups = new Map<string, DeferredSource[]>();
  for (const row of rows) {
    if (row.status !== "deferred") continue;
    const key = row.deferredReason ?? "(null)";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups]
    .map(([rawReason, members]) => ({
      reason: reasons.includes(rawReason) ? (rawReason as DeferredReason) : ("other" as const),
      ...(reasons.includes(rawReason) ? {} : { rawReason }),
      count: members.length,
      keywordCount: new Set(members.map((row) => row.keywordId)).size,
      firstAt: new Date(Math.min(...members.map((row) => row.checkedAt.getTime()))).toISOString(),
      lastAt: new Date(Math.max(...members.map((row) => row.checkedAt.getTime()))).toISOString(),
    }))
    .sort(
      (a, b) =>
        b.count - a.count || (a.rawReason ?? a.reason).localeCompare(b.rawReason ?? b.reason),
    );
}
export async function loadCheckRunsSummary(
  projectId: string,
  range: { start: Date; end: Date },
  providerChain: Promise<readonly ProviderChainEntry[]>,
  where: Prisma.RankCheckWhereInput = { checkedAt: { gte: range.start, lte: range.end } },
): Promise<CheckRunsSummary> {
  const scope = { AND: [{ keyword: { projectId } }, where] };
  const [rows, evidence, spendRows, chain] = await Promise.all([
    prisma.rankCheck.findMany({
      where: scope,
      select: {
        status: true,
        provider: true,
        viaFallback: true,
        attempts: true,
        keywordId: true,
        checkedAt: true,
        deferredReason: true,
      },
    }),
    readCheckEvidence(projectId, { where }),
    prisma.$queryRaw<Array<{ total: unknown }>>(Prisma.sql`
      SELECT COALESCE(SUM("costCents"), 0) AS total FROM (${canonicalUsageSql()}) usage
      WHERE "projectId"=${projectId} AND feature='rank_check'
        AND "createdAt">=${range.start} AND "createdAt"<=${range.end}
        AND cached=false AND "measurementStatus"='recorded'`),
    providerChain,
  ]);
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  const completed = count("completed"),
    failed = count("failed"),
    running = count("running");
  return {
    counts: {
      completed,
      failed,
      running,
      deferred: count("deferred"),
      runs: completed + failed + running,
      viaFallback: rows.filter((row) => row.viaFallback).length,
    },
    deferredGroups: deferredGroups(rows),
    evidenceCounts: projectionCounts(evidence.values()),
    providerHealth: buildProviderHealth(
      rows
        .filter((row) => row.status === "completed")
        .map((row) => ({
          provider: row.provider,
          viaFallback: row.viaFallback,
          _count: { _all: 1 },
        })),
      rows.filter((row) => row.viaFallback || ["failed", "deferred"].includes(row.status)),
      chain,
    ),
    spendCents: Number(spendRows[0]?.total ?? 0),
  };
}
