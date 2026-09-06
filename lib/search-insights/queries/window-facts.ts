import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { SEARCH_INSIGHTS_SEARCH_TYPE } from "@/lib/search-insights/constants";
import { addDays, dateFromKey } from "@/lib/search-insights/dates";
import { z } from "zod";

/**
 * Window aggregates the import computes once, instead of every render recomputing them.
 *
 * Measured cold on a container shaped like the production instance class (1 GiB, 2 vCPU,
 * `work_mem` 4 MB) over 12.96M query-page rows, at the 90 day window: overlap count 4,202 ms,
 * distinct counts 2,617 ms, top queries 1,494 ms, coverage 1,657 ms. Evidence lives in the run
 * directory as `t1b-micro-benchmark/timings-micro.md`.
 *
 * The import is the ONLY writer. A render reads; on a miss it computes live, records the miss, and
 * writes nothing.
 *
 * Staleness is a flag rather than a property of the key. Moving `finalizedThrough` forward is not
 * the only event that changes these numbers: a backfill that fills a gap INSIDE an already
 * computed window changes them while the boundary stands still. Any write to daily rows inside a
 * covered span marks the affected rows stale, and a stale row is never served.
 *
 * The compared window is its own row with the same `windowDays` and `finalizedThrough` one day
 * before this row's window starts, so a delta is two reads. Nothing older is kept: each refresh
 * prunes that window length back to the pair, because no reader ever asks for an older boundary.
 */

const coverageSchema = z.object({
  calculable: z.boolean(),
  capHitDays: z.number(),
  clicksShare: z.number(),
  impressionsShare: z.number(),
});

// Only the query count survives: the page half was computed and read by nothing.
const countsSchema = z.object({ queries: z.number() });

const signalsSchema = z.object({ bandCount: z.number(), overlapCount: z.number() });

const windowTotalsSchema = z.object({
  clicks: z.number(),
  ctr: z.number(),
  impressions: z.number(),
  position: z.number(),
});

const totalsSchema = z.object({ current: windowTotalsSchema, previous: windowTotalsSchema });

const queryRowSchema = z.object({
  clicks: z.number(),
  ctr: z.number(),
  impressions: z.number(),
  position: z.number(),
  query: z.string(),
});

const defaultLensQueriesSchema = z.object({
  rows: z.array(queryRowSchema),
  total: z.number(),
});

const windowFactsSchema = z.object({
  counts: countsSchema,
  coverage: coverageSchema,
  defaultLensQueries: defaultLensQueriesSchema,
  signals: signalsSchema,
  totals: totalsSchema,
});

export type SearchInsightsWindowFacts = z.infer<typeof windowFactsSchema>;

/** How many rows the default lens holds: the first view's page plus one Show more. */
export const DEFAULT_LENS_ROW_LIMIT = 100;

export type WindowFactsKey = {
  /** Newest finalized day inside the window. A date key, not a timestamp. */
  finalizedThrough: string;
  projectId: string;
  property: string;
  windowDays: number;
};

/** The compared window's row key: same length, ending the day before this window starts. */
export function comparedWindowKey(key: WindowFactsKey): WindowFactsKey {
  return {
    ...key,
    finalizedThrough: addDays(key.finalizedThrough, -key.windowDays),
  };
}

function uniqueWhere(key: WindowFactsKey) {
  return {
    projectId_property_searchType_windowDays_finalizedThrough: {
      finalizedThrough: dateFromKey(key.finalizedThrough),
      projectId: key.projectId,
      property: key.property,
      searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
      windowDays: key.windowDays,
    },
  };
}

export type WindowFactsMiss = "absent" | "stale" | "unreadable" | "malformed";

export type WindowFactsRead =
  | { facts: SearchInsightsWindowFacts; kind: "hit" }
  | { kind: "miss"; reason: WindowFactsMiss };

/**
 * Read one window's facts. Every failure path is a miss, so the caller computes live: a row that
 * cannot be read is a latency problem, while a page rendering empty because of one is an outage.
 *
 * Misses are recorded under a stable event name so their rate is observable. There is no metrics
 * client in this repository, so this is a structured log rather than a counter.
 */
export async function readWindowFacts(key: WindowFactsKey): Promise<WindowFactsRead> {
  let miss: WindowFactsMiss;
  try {
    const row = await prisma.searchInsightsWindowFacts.findUnique({
      select: {
        counts: true,
        coverage: true,
        defaultLensQueries: true,
        signals: true,
        stale: true,
        totals: true,
      },
      where: uniqueWhere(key),
    });
    if (!row) miss = "absent";
    else if (row.stale) miss = "stale";
    else {
      const parsed = windowFactsSchema.safeParse(row);
      if (parsed.success) return { facts: parsed.data, kind: "hit" };
      // A payload written by an older shape recomputes rather than reaching the page.
      miss = "malformed";
    }
  } catch (error) {
    console.error("[search-insights] window facts could not be read", {
      error,
      finalizedThrough: key.finalizedThrough,
      projectId: key.projectId,
      windowDays: key.windowDays,
    });
    miss = "unreadable";
  }
  console.info("[search-insights] window_facts_miss", {
    finalizedThrough: key.finalizedThrough,
    projectId: key.projectId,
    reason: miss,
    windowDays: key.windowDays,
  });
  return { kind: "miss", reason: miss };
}

export type WindowFactsWrite = WindowFactsKey & {
  coveredDays: number;
  facts: SearchInsightsWindowFacts;
  importId: string;
};

/**
 * Replace one window's row. Import-side only. Writing clears `stale`, because the row is being
 * recomputed from the daily rows as they now stand.
 *
 * Takes an optional transaction client so a window and its compared row are written together: a
 * delta read from half-updated rows would be wrong.
 */
export async function writeWindowFacts(
  input: WindowFactsWrite,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const payload = {
    counts: input.facts.counts,
    coverage: input.facts.coverage,
    coveredDays: input.coveredDays,
    defaultLensQueries: input.facts.defaultLensQueries,
    importId: input.importId,
    signals: input.facts.signals,
    stale: false,
    totals: input.facts.totals,
  };
  await client.searchInsightsWindowFacts.upsert({
    create: {
      ...payload,
      finalizedThrough: dateFromKey(input.finalizedThrough),
      projectId: input.projectId,
      property: input.property,
      searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
      windowDays: input.windowDays,
    },
    update: { ...payload, computedAt: new Date() },
    where: uniqueWhere(input),
  });
}

/**
 * Mark every row whose covered span touches [from, to] stale. Import-side only.
 *
 * A row's span is `finalizedThrough - windowDays + 1 .. finalizedThrough`, so a row is affected
 * when its `finalizedThrough` is at or after `from` and its span start is at or before `to`. The
 * widest window bounds how far back that reaches, so the predicate is expressed on
 * `finalizedThrough` alone and deliberately over-selects rather than missing one.
 */
export async function markWindowFactsStale(
  input: {
    from: string;
    projectId: string;
    property: string;
    to: string;
    widestWindowDays: number;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const result = await client.searchInsightsWindowFacts.updateMany({
    data: { stale: true },
    where: {
      finalizedThrough: {
        gte: dateFromKey(input.from),
        lte: dateFromKey(addDays(input.to, input.widestWindowDays)),
      },
      projectId: input.projectId,
      property: input.property,
      searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
      stale: false,
    },
  });
  return result.count;
}

/**
 * Drop every row for this window length except the current pair. Import-side only.
 *
 * Nothing reads an older boundary. A render always asks for the newest finalized window, and
 * `refreshWindowFacts` recomputes the compared row rather than reading a stored one, so a row
 * stops having a reader the moment a newer finalized day arrives.
 *
 * Keeping them would not buy an "as of" history either: a backfill marks old rows stale and only
 * the current pair is ever recomputed, so the retained rows would be a mix of readable and
 * permanently dead ones. A real history would have to recompute stale rows, which is the cost this
 * table exists to avoid, and belongs in its own table with its own contract.
 *
 * Scoped to one `windowDays` so a concurrent refresh of another window cannot lose its pair.
 */
export async function pruneWindowFactsToPair(
  key: WindowFactsKey,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const compared = comparedWindowKey(key);
  const result = await client.searchInsightsWindowFacts.deleteMany({
    where: {
      finalizedThrough: {
        notIn: [dateFromKey(key.finalizedThrough), dateFromKey(compared.finalizedThrough)],
      },
      projectId: key.projectId,
      property: key.property,
      searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
      windowDays: key.windowDays,
    },
  });
  return result.count;
}
