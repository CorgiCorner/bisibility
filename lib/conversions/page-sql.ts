import { Prisma } from "@/lib/generated/prisma/client";
import { canonicalPagePathSql } from "@/lib/pages/page-path";
import type { ConversionSource } from "./types";

export type ConversionSqlWindow = {
  from: Date;
  host: string;
  projectId: string;
  source: ConversionSource | null;
  to: Date;
};

const enabledGoal = Prisma.sql`EXISTS (
  SELECT 1 FROM "conversion_goals" goal
  WHERE goal."projectId" = daily."projectId"
    AND goal.source = daily.source
    AND goal."sourceName" = daily.name
    AND goal.enabled = true
)`;

function windowFilter(input: ConversionSqlWindow & { source: ConversionSource }) {
  return Prisma.sql`
    daily."projectId" = ${input.projectId}
    AND daily.source::text = ${input.source}
    AND daily.date >= ${input.from}::date
    AND daily.date <= ${input.to}::date
    AND ${enabledGoal}
  `;
}

/** Period sum per canonical path. An unselected source contributes no rows. */
export function conversionsCte(input: ConversionSqlWindow) {
  if (!input.source) {
    return Prisma.sql`conversions AS (
      SELECT NULL::text AS path, NULL::int AS value WHERE false
    )`;
  }
  return Prisma.sql`conversions AS (
    SELECT path, SUM(count)::int AS value
    FROM (
      SELECT ${canonicalPagePathSql(Prisma.sql`daily.path`, input.host)} AS path, daily.count
      FROM "conversion_daily" daily
      WHERE ${windowFilter({ ...input, source: input.source })}
    ) raw
    WHERE path IS NOT NULL
    GROUP BY path
  )`;
}

/** One day and path, for a cumulative existing-versus-new series. */
export function conversionDailyMetricCte(input: ConversionSqlWindow) {
  if (!input.source) {
    return Prisma.sql`metric AS (
      SELECT NULL::date AS day, NULL::text AS path, NULL::int AS value WHERE false
    )`;
  }
  return Prisma.sql`metric AS (
    SELECT day, path, SUM(value)::int AS value
    FROM (
      SELECT daily.date::date AS day,
        ${canonicalPagePathSql(Prisma.sql`daily.path`, input.host)} AS path,
        daily.count AS value
      FROM "conversion_daily" daily
      WHERE ${windowFilter({ ...input, source: input.source })}
    ) raw
    WHERE path IS NOT NULL
    GROUP BY day, path
  )`;
}
