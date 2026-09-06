import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { finalizedWindow } from "@/lib/search-insights/dates";
import { getWindowCounts } from "./counts";
import { getQueryCoverage } from "./coverage";
import { getWindowTotals } from "./kpis";
import { getSearchInsightsSignals } from "./signals";
import { getTopQueries } from "./top-rows";
import {
  comparedWindowKey,
  DEFAULT_LENS_ROW_LIMIT,
  pruneWindowFactsToPair,
  type SearchInsightsWindowFacts,
  type WindowFactsKey,
  writeWindowFacts,
} from "./window-facts";
import { searchInsightsWindowFilter } from "./window-filter";

/**
 * Compute one window's facts from the daily rows as they now stand.
 *
 * Import-side. This is the expensive half of the module and the reason the table exists: on a
 * container shaped like the production instance class, the reads below sum to roughly 8 seconds
 * for a 90 day window and 3 seconds for 28.
 *
 * Note on cost, because an earlier estimate in the plan was based on laptop timings: the overlap
 * count alone measured 4,147 ms cold at 90 days on production-shaped hardware even with the
 * single-scan rewrite and 16 MB of work memory, against 131 ms on a developer machine. Refreshing
 * four windows and their four compared rows is therefore tens of seconds of worker time per
 * import batch, not the one second the plan assumed. That is still the right trade, because it
 * moves the cost off every render onto one job per finalized day, but it is not free and it should
 * not run inside a single long transaction on a 1 GiB instance.
 */
export async function computeWindowFacts(
  key: WindowFactsKey,
): Promise<{ coveredDays: number; facts: SearchInsightsWindowFacts }> {
  const window = finalizedWindow(key.finalizedThrough, key.windowDays);
  const { current } = window;
  const [coverage, counts, signals, totals, queries, coveredDays] = await Promise.all([
    getQueryCoverage(key.projectId, key.property, current),
    getWindowCounts(key.projectId, key.property, current),
    getSearchInsightsSignals(key.projectId, key.property, current),
    getWindowTotals(key.projectId, key.property, window),
    getTopQueries(key.projectId, key.property, current, {
      limit: DEFAULT_LENS_ROW_LIMIT,
      offset: 0,
    }),
    countCoveredDays(key.projectId, key.property, current),
  ]);

  return {
    coveredDays,
    facts: {
      counts,
      coverage,
      // Structural clone through the row shape the schema validates, so a payload can never carry
      // a bigint or an undefined into JSONB.
      defaultLensQueries: {
        rows: queries.rows.map((row) => ({
          clicks: row.clicks,
          ctr: row.ctr,
          impressions: row.impressions,
          position: row.position,
          query: row.query,
        })),
        total: queries.total,
      },
      signals,
      totals,
    },
  };
}

/**
 * How many days of the window actually carried data. Read from the aggregate table, which holds
 * one row per day, so this is provenance rather than another scan of the dimensional tables.
 */
async function countCoveredDays(
  projectId: string,
  property: string,
  window: { end: string; start: string },
) {
  const rows = await prisma.$queryRaw<{ days: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS "days"
    FROM "search_analytics_daily"
    WHERE ${searchInsightsWindowFilter(projectId, property, window)}
  `);
  return Number(rows.at(0)?.days ?? 0);
}

export type WindowFactsRefresh = {
  finalizedThrough: string;
  importId: string;
  projectId: string;
  property: string;
  /** Window lengths the readiness gate already calls ready. The selector owns readiness. */
  readyWindowDays: readonly number[];
};

export type WindowFactsRefreshResult = {
  failed: readonly { reason: string; windowDays: number }[];
  written: readonly number[];
};

/**
 * Recompute and replace every ready window's row, and its compared row with it.
 *
 * ONE TRANSACTION PER WINDOW PAIR, not one for the whole refresh, and that is a deliberate
 * departure from the plan. A window and its comparison are written together, because a delta read
 * from half-updated rows would be wrong. But wrapping all four windows in one transaction would
 * hold a single connection open for tens of seconds on a 1 GiB instance, block vacuum from
 * reclaiming exactly the rows the import just rewrote, and turn any one window's failure into a
 * refresh that wrote nothing. Per-pair transactions keep the invariant that matters and bound the
 * blast radius of a failure to one window.
 *
 * Only ready windows get rows: a row must never exist for a window the gate would not show.
 * Failures are collected rather than thrown, so one bad window cannot abandon the others; the
 * caller decides whether a partial refresh is worth retrying.
 */
export async function refreshWindowFacts(
  input: WindowFactsRefresh,
): Promise<WindowFactsRefreshResult> {
  const written: number[] = [];
  const failed: { reason: string; windowDays: number }[] = [];

  for (const windowDays of input.readyWindowDays) {
    const key = {
      finalizedThrough: input.finalizedThrough,
      projectId: input.projectId,
      property: input.property,
      windowDays,
    };
    try {
      const compared = comparedWindowKey(key);
      const [currentFacts, comparedFacts] = await Promise.all([
        computeWindowFacts(key),
        computeWindowFacts(compared),
      ]);
      await prisma.$transaction(async (tx) => {
        await writeWindowFacts({ ...key, ...currentFacts, importId: input.importId }, tx);
        await writeWindowFacts({ ...compared, ...comparedFacts, importId: input.importId }, tx);
        // Same transaction as the pair it keeps, so a reader never sees the table without one.
        await pruneWindowFactsToPair(key, tx);
      });
      written.push(windowDays);
    } catch (error) {
      failed.push({
        reason: error instanceof Error ? error.message : "unknown",
        windowDays,
      });
    }
  }

  return { failed, written };
}
