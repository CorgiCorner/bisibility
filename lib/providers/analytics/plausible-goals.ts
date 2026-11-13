import "server-only";

import type { ProviderCredentials } from "@/lib/providers/types";
import { z } from "zod";
import {
  PLAUSIBLE_ORGANIC_SEARCH_FILTER,
  plausibleRejectsMetric,
  postPlausibleQuery,
} from "./plausible";

export const PLAUSIBLE_GOAL_DIMENSIONS = ["event:goal", "visit:entry_page", "time:day"] as const;
export const PLAUSIBLE_GOAL_METRICS = ["events", "visitors"] as const;
export const PLAUSIBLE_GOAL_REVENUE_METRIC = "total_revenue";
export const PLAUSIBLE_GOAL_PAGE_LIMIT = 5_000;
export const PLAUSIBLE_GOAL_MAX_PAGES = 20;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

export class PlausibleGoalParseError extends Error {
  constructor() {
    super("Plausible goal query returned an unexpected body.");
    this.name = "PlausibleGoalParseError";
  }
}

export type PlausibleGoalRevenue = { currency: string; minor: bigint };

export type PlausibleGoalEvent = {
  date: string;
  entryPage: string;
  events: number;
  goal: string;
  revenue: PlausibleGoalRevenue | null;
};

export type PlausibleGoalFetchResult = {
  revenueSupported: boolean;
  rows: PlausibleGoalEvent[];
  truncated: boolean;
};

type GoalQuery = {
  date_range: [string, string];
  dimensions: readonly string[];
  filters: typeof PLAUSIBLE_ORGANIC_SEARCH_FILTER;
  metrics: readonly string[];
  pagination: { limit: number; offset: number };
};

const countMetric = z.number().int().nonnegative();
const revenueMetric = z.union([
  z.null(),
  z.number().finite(),
  z
    .object({
      currency: z.string().nullable().optional(),
      value: z.number().finite(),
    })
    .strip(),
]);

function realUtcDay(value: string) {
  if (!DAY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function responseSchema(includeRevenue: boolean) {
  const metrics = includeRevenue
    ? z.tuple([countMetric, countMetric, revenueMetric])
    : z.tuple([countMetric, countMetric]);
  return z
    .object({
      meta: z.unknown().optional(),
      query: z.unknown().optional(),
      results: z.array(
        z
          .object({
            dimensions: z.tuple([
              z.string().trim().min(1).max(200),
              z.string().trim().min(1).max(2_000),
              z.string().refine(realUtcDay),
            ]),
            metrics,
          })
          .strict(),
      ),
    })
    .strict();
}

export function plausibleGoalQuery(input: {
  endDate: string;
  includeRevenue: boolean;
  limit: number;
  offset: number;
  startDate: string;
}): GoalQuery {
  return {
    date_range: [input.startDate, input.endDate],
    dimensions: PLAUSIBLE_GOAL_DIMENSIONS,
    filters: PLAUSIBLE_ORGANIC_SEARCH_FILTER,
    metrics: input.includeRevenue
      ? [...PLAUSIBLE_GOAL_METRICS, PLAUSIBLE_GOAL_REVENUE_METRIC]
      : [...PLAUSIBLE_GOAL_METRICS],
    pagination: { limit: input.limit, offset: input.offset },
  };
}

function revenueFromMetric(metric: z.infer<typeof revenueMetric>): PlausibleGoalRevenue | null {
  const value =
    typeof metric === "number"
      ? metric
      : metric && typeof metric === "object"
        ? metric.value
        : null;
  const currency =
    metric && typeof metric === "object" && typeof metric.currency === "string"
      ? metric.currency.trim().toUpperCase()
      : null;
  if (value === null || !currency || !CURRENCY.test(currency) || value < 0) return null;
  const cents = Math.round((value + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) return null;
  return { currency, minor: BigInt(cents) };
}

/** Strict Stats API v2 body: `results: [{ dimensions, metrics }]`. */
export function parsePlausibleGoalResults(
  payload: unknown,
  includeRevenue: boolean,
): PlausibleGoalEvent[] {
  const parsed = responseSchema(includeRevenue).safeParse(payload);
  if (!parsed.success) throw new PlausibleGoalParseError();
  return parsed.data.results.map((row) => {
    const [goal, entryPage, date] = row.dimensions;
    const revenue = includeRevenue ? revenueFromMetric(row.metrics[2] ?? null) : null;
    return {
      date,
      entryPage,
      events: row.metrics[0],
      goal,
      revenue,
    };
  });
}

async function readPages(
  creds: ProviderCredentials,
  input: { endDate: string; startDate: string },
  includeRevenue: boolean,
  pageLimit: number,
  maxPages: number,
) {
  const rows: PlausibleGoalEvent[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await postPlausibleQuery(
      creds,
      plausibleGoalQuery({
        endDate: input.endDate,
        includeRevenue,
        limit: pageLimit,
        offset: page * pageLimit,
        startDate: input.startDate,
      }),
    );
    const parsed = parsePlausibleGoalResults(payload, includeRevenue);
    rows.push(...parsed);
    if (parsed.length < pageLimit)
      return { revenueSupported: includeRevenue, rows, truncated: false };
  }
  return { revenueSupported: includeRevenue, rows, truncated: true };
}

/**
 * One day or a date range of goal conversions.
 * `total_revenue` is requested only until the API rejects that metric; otherwise revenue stays null.
 * The live call is not verified here: tests use fixtures shaped like the public Stats API v2 reference.
 */
export async function fetchPlausibleGoalConversions(
  creds: ProviderCredentials,
  input: { endDate: string; startDate: string },
  options?: { maxPages?: number; pageLimit?: number },
): Promise<PlausibleGoalFetchResult> {
  const pageLimit = options?.pageLimit ?? PLAUSIBLE_GOAL_PAGE_LIMIT;
  const maxPages = options?.maxPages ?? PLAUSIBLE_GOAL_MAX_PAGES;
  try {
    return await readPages(creds, input, true, pageLimit, maxPages);
  } catch (error) {
    if (!plausibleRejectsMetric(error, PLAUSIBLE_GOAL_REVENUE_METRIC)) throw error;
    const withoutRevenue = await readPages(creds, input, false, pageLimit, maxPages);
    return { ...withoutRevenue, revenueSupported: false };
  }
}
