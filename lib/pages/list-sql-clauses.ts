import { Prisma } from "@/lib/generated/prisma/client";
import { canonicalPagePathSql } from "./page-path";
import type { ProjectPageCwvFilter } from "./types";

type SessionsInput = {
  from: Date;
  ga4Property: string | null;
  host: string;
  projectId: string;
  sessions: "ga4" | "none" | "plausible";
  to: Date;
};

function cwvStatus(filter: ProjectPageCwvFilter) {
  if (filter === "pass") return "good";
  if (filter === "needs_work") return "needs_improvement";
  if (filter === "poor") return "poor";
  return null;
}

export function vitalsPredicate(filter: ProjectPageCwvFilter | undefined, column: Prisma.Sql) {
  if (!filter) return Prisma.sql`TRUE`;
  const status = cwvStatus(filter);
  if (!status) return Prisma.sql`${column} IS NULL`;
  return Prisma.sql`${column}::text = ${status}`;
}

export function sessionsCte(input: SessionsInput) {
  if (input.sessions === "ga4" && input.ga4Property) {
    return Prisma.sql`sessions AS (
      SELECT path, SUM(sessions)::int AS value
      FROM (
        SELECT ${canonicalPagePathSql(Prisma.sql`daily.path`, input.host)} AS path, daily.sessions
        FROM "organic_sessions_page_daily" daily
        WHERE daily."projectId" = ${input.projectId}
          AND daily.property = ${input.ga4Property}
          AND daily.date >= ${input.from}::date
          AND daily.date <= ${input.to}::date
      ) raw
      WHERE path IS NOT NULL
      GROUP BY path
    )`;
  }
  if (input.sessions === "plausible") {
    return Prisma.sql`sessions AS (
      SELECT canonical AS path, sessions AS value
      FROM (
        SELECT DISTINCT ON (snapshot.path)
          snapshot.path,
          snapshot.sessions,
          ${canonicalPagePathSql(Prisma.sql`snapshot.path`, input.host)} AS canonical
        FROM "page_traffic_snapshots" snapshot
        WHERE snapshot."projectId" = ${input.projectId}
          AND snapshot.provider = 'plausible'
          AND snapshot."windowDays" = 28
        ORDER BY snapshot.path, snapshot.date DESC
      ) raw
      WHERE canonical IS NOT NULL
    )`;
  }
  return Prisma.sql`sessions AS (SELECT NULL::text AS path, NULL::int AS value WHERE false)`;
}
