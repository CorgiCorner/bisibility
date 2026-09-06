import { Prisma, ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { activeKeywordWhere } from "@/lib/queries/keyword-active";
import {
  KEYWORD_ARCHIVED_REASON,
  MARKET_INACTIVE_REASON,
  type UnrunnableReason,
} from "@/lib/rank-check/runnable-reasons";

/**
 * The runnable predicate for rank-check dispatch.
 *
 * A keyword row may be planned, dispatched, bought from a provider and billed only when
 *   1. its market is `active` - the `project_markets` row matching the keyword's
 *      (projectId, locationId) pair, and
 *   2. the row itself is not archived.
 *
 * Schedule admission (the per-keyword `paused` frequency, cron windows, manual launches) is a
 * third, separate condition already owned by the frequency filters. This module never
 * re-implements it.
 *
 * `Keyword` has no foreign key to `ProjectMarket`; the join is the (projectId, locationId) pair,
 * backed by @@unique([projectId, locationId]) on `project_markets` and @@index([locationId]) on
 * `keywords`.
 */

export type { UnrunnableReason } from "@/lib/rank-check/runnable-reasons";

export type RunnableKeywordRow = { archivedAt: Date | null; locationId: string };

/** Everything the predicate needs to read the market registry, transaction client included. */
export type ActiveMarketClient = Pick<Prisma.TransactionClient, "projectMarket">;

const SQL_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

function keywordAlias(alias: string) {
  if (!SQL_ALIAS.test(alias)) {
    throw new Error("Keyword table alias must be a plain SQL identifier.");
  }
  return Prisma.raw(alias);
}

/**
 * `TRUE` when an active `project_markets` row exists for the aliased keyword's market pair.
 * The bare `'active'` literal is coerced to `"ProjectMarketStatus"` by Postgres, the same way
 * `p."writeMode" = 'active'` is coerced in the dispatcher query; no explicit cast is needed.
 */
export function activeMarketExistsSql(alias = "k") {
  const keyword = keywordAlias(alias);
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "project_markets" pm
    WHERE pm."projectId" = ${keyword}."projectId"
      AND pm."locationId" = ${keyword}."locationId"
      AND pm.status = 'active'
  )`;
}

/** `TRUE` when the aliased keyword row has not been archived. */
export function keywordNotArchivedSql(alias = "k") {
  return Prisma.sql`${keywordAlias(alias)}."archivedAt" IS NULL`;
}

/** The full runnable condition for raw-SQL dispatch paths, keyword table aliased by the caller. */
export function runnableKeywordSql(alias = "k") {
  return Prisma.sql`(${keywordNotArchivedSql(alias)} AND ${activeMarketExistsSql(alias)})`;
}

/** The same condition for the default `k` alias. */
export const RUNNABLE_KEYWORD_SQL = runnableKeywordSql();

/**
 * The reason a row is not runnable, or `null` when it is. Archival wins over market status:
 * the row itself is gone, which is the more specific fact to show an operator.
 */
export function unrunnableClaimReason(row: {
  archivedAt: Date | null;
  marketActive: boolean;
}): UnrunnableReason | null {
  if (row.archivedAt !== null) return KEYWORD_ARCHIVED_REASON;
  if (!row.marketActive) return MARKET_INACTIVE_REASON;
  return null;
}

/** The reason a keyword is not runnable against a project's active market locations. */
export function unrunnableKeywordReason(
  keyword: RunnableKeywordRow,
  activeLocationIds: ReadonlySet<string>,
) {
  return unrunnableClaimReason({
    archivedAt: keyword.archivedAt,
    marketActive: activeLocationIds.has(keyword.locationId),
  });
}

/** Pure, no I/O. True when the keyword's market is active and the row is not archived. */
export function isRunnableKeyword(
  keyword: RunnableKeywordRow,
  activeLocationIds: ReadonlySet<string>,
) {
  return unrunnableKeywordReason(keyword, activeLocationIds) === null;
}

/** The `locationId` values whose market row for this project is active. `paused` is not runnable. */
export async function activeMarketLocationIds(projectId: string, client: ActiveMarketClient) {
  const markets = await client.projectMarket.findMany({
    select: { locationId: true },
    where: { projectId, status: ProjectMarketStatus.active },
  });
  return new Set(markets.map((market) => market.locationId));
}

/** The same set for every project at once, for sweeps that are not scoped to one project. */
export async function activeMarketLocationIdsByProject(client: ActiveMarketClient) {
  const markets = await client.projectMarket.findMany({
    select: { locationId: true, projectId: true },
    where: { status: ProjectMarketStatus.active },
  });
  const byProject = new Map<string, Set<string>>();
  for (const market of markets) {
    const locations = byProject.get(market.projectId) ?? new Set<string>();
    locations.add(market.locationId);
    byProject.set(market.projectId, locations);
  }
  return byProject;
}

/** The Prisma `where` fragment for Prisma-based dispatch paths. */
export function runnableKeywordWhere(activeLocationIds: Iterable<string>) {
  return {
    ...activeKeywordWhere,
    locationId: { in: [...activeLocationIds] },
  } satisfies Prisma.KeywordWhereInput;
}
