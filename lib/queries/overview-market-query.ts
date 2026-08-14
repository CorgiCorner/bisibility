import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { OverviewRange } from "./overview-filters";
import { overviewMarketHistoryStart } from "./overview-markets";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<OverviewRange, number> = { "7d": 7, "28d": 28, "90d": 90 };
const TREND_POINTS = 8;

type MarketCheckRow = {
  checkedAt: Date;
  keywordId: string;
  position: number | null;
  status: "completed";
};

type MarketCheckFilters = {
  device?: "desktop" | "mobile" | null;
  marketIds?: string[];
  tag?: string | null;
};

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function overviewMarketSnapshotAnchors(now: Date, range: OverviewRange) {
  const days = RANGE_DAYS[range];
  const currentStart = new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);
  const previousEnd = new Date(currentStart.getTime() - 1);
  const width = now.getTime() - currentStart.getTime();
  const trend = Array.from(
    { length: TREND_POINTS },
    (_, index) => new Date(currentStart.getTime() + (width * index) / (TREND_POINTS - 1)),
  );
  return [...new Map([previousEnd, ...trend, now].map((date) => [date.getTime(), date])).values()];
}

export async function fetchOverviewMarketChecks(
  projectId: string,
  keywordLimit: number,
  now: Date,
  range: OverviewRange,
  filters: MarketCheckFilters = {},
) {
  const anchors = overviewMarketSnapshotAnchors(now, range);
  const deviceFilter = filters.device
    ? Prisma.sql`AND k.device::text = ${filters.device}`
    : Prisma.empty;
  const tagFilter = filters.tag
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "keyword_tags" kt JOIN "tags" t ON t.id = kt."tagId" WHERE kt."keywordId" = k.id AND t.name = ${filters.tag})`
    : Prisma.empty;
  const marketFilter = filters.marketIds?.length
    ? Prisma.sql`AND k."locationId" IN (${Prisma.join(filters.marketIds)})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<MarketCheckRow[]>(Prisma.sql`
    WITH scoped_keywords AS (
      SELECT k.id
      FROM "keywords" k
      WHERE k."projectId" = ${projectId}
        ${deviceFilter}
        ${marketFilter}
        ${tagFilter}
      ORDER BY k."createdAt" DESC, k.id DESC
      LIMIT ${keywordLimit}
    ), anchors("at") AS (
      VALUES ${Prisma.join(anchors.map((anchor) => Prisma.sql`(${anchor}::timestamp(3))`))}
    )
    SELECT scoped_keywords.id AS "keywordId", snapshot."checkedAt", snapshot.position,
      'completed'::text AS status
    FROM scoped_keywords
    CROSS JOIN anchors
    JOIN LATERAL (
      SELECT rc."checkedAt", rc.position
      FROM "rank_checks" rc
      WHERE rc."keywordId" = scoped_keywords.id
        AND rc.status = 'completed'
        AND rc."checkedAt" >= ${overviewMarketHistoryStart(now, range)}
        AND rc."checkedAt" <= anchors."at"
      ORDER BY rc."checkedAt" DESC, rc.id DESC
      LIMIT 1
    ) snapshot ON true
  `);

  const byKeyword = new Map<string, MarketCheckRow[]>();
  for (const row of rows) {
    const checks = byKeyword.get(row.keywordId) ?? [];
    if (!checks.some((check) => check.checkedAt.getTime() === row.checkedAt.getTime())) {
      checks.push(row);
      byKeyword.set(row.keywordId, checks);
    }
  }
  return byKeyword;
}
