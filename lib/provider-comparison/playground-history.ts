import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  HISTORY_SCAN_BOUND,
  type HistoryQuery,
  type HistoryRow,
} from "@/lib/research-history/contract";
import { historyCostFromCents } from "@/lib/research-history/cost";
import {
  assembleHistoryPage,
  decodeHistoryCursor,
  filterValue,
  historyTake,
  orderedHistoryChips,
  pinnedOnly,
  sliceHistoryIds,
} from "@/lib/research-history/page";
import { projectHistoryTimeZone } from "@/lib/research-history/pins";
import { countValue, ilike, keysetSql, textValues } from "@/lib/research-history/sql";
import { parseComparisonSnapshot } from "./model";
import { groupPlaygroundHistory, type PlaygroundHistorySource } from "./playground-history-group";
import { fetchedOverviewWhere, playgroundSearch } from "./playground-history-search";
import type { ComparisonRun } from "./types";

export { readRecentPlaygroundSearches } from "./playground-history-search";
export type PlaygroundHistoryEntry = Pick<
  ComparisonRun,
  "id" | "createdAt" | "keyword" | "search" | "overviewFetched"
>;

const sideSelect = { costCents: true, customerCostCents: true } as const;

function decimalCents(value: { toString(): string } | null | undefined) {
  if (value == null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function runCents(
  sides: ReadonlyArray<{
    costCents: { toString(): string } | null;
    customerCostCents: { toString(): string } | null;
  }>,
) {
  if (sides.length === 0) return null;
  const values = sides.map((side) => decimalCents(side.customerCostCents ?? side.costCents));
  if (values.some((value) => value == null)) return null;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function sourceFromRun(row: {
  createdAt: Date;
  id: string;
  sides: ReadonlyArray<{
    costCents: { toString(): string } | null;
    customerCostCents: { toString(): string } | null;
  }>;
  snapshot: unknown;
}): PlaygroundHistorySource | null {
  try {
    const snapshot = parseComparisonSnapshot(row.snapshot);
    if (snapshot.version !== 2 || snapshot.keywordId !== null) return null;
    return {
      aiOverview: snapshot.aiOverview === true,
      cents: runCents(row.sides),
      createdAt: row.createdAt.toISOString(),
      device: snapshot.device,
      id: row.id,
      locationId: snapshot.locationId,
      market: snapshot.locationLabel,
      text: snapshot.text,
    };
  } catch {
    return null;
  }
}

function equalsSql(column: Prisma.Sql, value: string | null) {
  return value ? Prisma.sql`${column} = ${value}` : Prisma.sql`TRUE`;
}

function pinSql(userId: string, enabled: boolean) {
  if (!enabled) return Prisma.sql`TRUE`;
  return Prisma.sql`EXISTS (
    SELECT 1 FROM research_history_pins pin
    WHERE pin."userId" = ${userId}
      AND pin."projectId" = provider_comparison_runs."projectId"
      AND pin.surface = 'serp_playground'::"ResearchHistorySurface"
      AND pin."itemKey" = provider_comparison_runs.id
  )`;
}

function playgroundWhere(input: {
  device: string | null;
  market: string | null;
  projectId: string;
  query: string;
  userId: string;
  pinned: boolean;
}) {
  return Prisma.sql`
    "projectId" = ${input.projectId}
    AND "keywordId" IS NULL
    AND snapshot->>'version' = '2'
    AND snapshot->'aiOverview' IS NULL
    AND ${ilike(Prisma.sql`COALESCE(snapshot->>'text', '')`, input.query)}
    AND ${equalsSql(Prisma.sql`snapshot->>'device'`, input.device)}
    AND ${equalsSql(Prisma.sql`snapshot->>'locationLabel'`, input.market)}
    AND ${pinSql(input.userId, input.pinned)}
  `;
}

async function loadRuns(projectId: string, ids: readonly string[], take: number) {
  if (ids.length === 0) return [];
  return prisma.providerComparisonRun.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true, id: true, sides: { select: sideSelect }, snapshot: true },
    take,
    where: { projectId, keywordId: null, id: { in: [...ids] }, AND: [playgroundSearch] },
  });
}

/**
 * Pages searches in the database. Completed overviews for their exact search
 * identities add a chip and cost without becoming separate history entries.
 */
export async function readPlaygroundHistory(
  projectId: string,
  userId: string,
  request: HistoryQuery,
  now?: Date,
) {
  const cursor = decodeHistoryCursor(request.cursor);
  const searched = playgroundWhere({
    device: null,
    market: null,
    pinned: false,
    projectId,
    query: request.query,
    userId,
  });
  const matched = playgroundWhere({
    device: filterValue(request.filters, "device"),
    market: filterValue(request.filters, "market"),
    pinned: pinnedOnly(request.filters),
    projectId,
    query: request.query,
    userId,
  });
  const take = historyTake(request.limit);
  const [timeZone, idRows, totals, pinnedTotals, devices, markets] = await Promise.all([
    projectHistoryTimeZone(projectId),
    prisma.$queryRaw<Array<{ createdAt: Date; id: string }>>`
      SELECT id, "createdAt" AS "createdAt"
      FROM provider_comparison_runs
      WHERE ${matched} AND ${keysetSql("createdAt", cursor)}
      ORDER BY "createdAt" DESC, id DESC
      LIMIT ${take}
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM provider_comparison_runs WHERE ${matched}
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM provider_comparison_runs
      WHERE ${searched} AND ${pinSql(userId, true)}
    `,
    prisma.$queryRaw<Array<{ value: string }>>`
      SELECT DISTINCT snapshot->>'device' AS value
      FROM provider_comparison_runs
      WHERE ${searched} AND snapshot->>'device' IN ('desktop', 'mobile')
      LIMIT ${HISTORY_SCAN_BOUND}
    `,
    prisma.$queryRaw<Array<{ value: string }>>`
      SELECT DISTINCT snapshot->>'locationLabel' AS value
      FROM provider_comparison_runs
      WHERE ${searched} AND COALESCE(snapshot->>'locationLabel', '') <> ''
      ORDER BY value
      LIMIT ${HISTORY_SCAN_BOUND}
    `,
  ]);
  const page = sliceHistoryIds(
    idRows.map((row) => ({ at: new Date(row.createdAt), id: row.id })),
    request.limit,
  );
  const organicRuns = await loadRuns(
    projectId,
    page.rows.map((row) => row.id),
    page.rows.length,
  );
  const followUps = organicRuns.length
    ? await prisma.providerComparisonRun.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { createdAt: true, id: true, sides: { select: sideSelect }, snapshot: true },
        take: HISTORY_SCAN_BOUND,
        where: fetchedOverviewWhere(
          projectId,
          organicRuns.map((run) => run.snapshot),
        ),
      })
    : [];
  const pageIds = new Set(organicRuns.map((run) => run.id));
  const sources = [...organicRuns, ...followUps].flatMap((run) => {
    const source = sourceFromRun(run);
    return source ? [source] : [];
  });
  const grouped = groupPlaygroundHistory(sources)
    .filter((entry) => pageIds.has(entry.id))
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
    );
  const keys = grouped.map((entry) => entry.id);
  const pins =
    keys.length === 0
      ? []
      : await prisma.researchHistoryPin.findMany({
          select: { itemKey: true },
          take: keys.length,
          where: { itemKey: { in: keys }, projectId, surface: "serp_playground", userId },
        });
  const pinnedKeys = new Set(pins.map((pin) => pin.itemKey));
  const rows: HistoryRow[] = grouped.map((entry) => ({
    cost: historyCostFromCents(entry.cents),
    key: entry.id,
    meta: {
      aiOverview: entry.overviewFetched === true,
      device: entry.device,
      kind: "serp",
      market: entry.market,
    },
    occurredAt: entry.createdAt,
    pinned: pinnedKeys.has(entry.id),
    title: entry.text,
  }));
  return assembleHistoryPage({
    chips: orderedHistoryChips({ devices: textValues(devices), markets: textValues(markets) }),
    nextCursor: page.nextCursor,
    now,
    pinnedCount: countValue(pinnedTotals),
    rows,
    timeZone,
    total: countValue(totals),
  });
}
