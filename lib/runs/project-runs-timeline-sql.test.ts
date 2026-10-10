import { Prisma } from "@/lib/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROJECT_RUNS_DEFAULT_QUERY, type ProjectRunsQuery } from "./filters";
import {
  type TimelineRow,
  timelineCandidatesSql,
  timelineCursorSql,
  timelineOrderSql,
} from "./project-runs-timeline-sql";

let db: PGlite;
const query: ProjectRunsQuery = { ...PROJECT_RUNS_DEFAULT_QUERY, limit: 2, view: "timeline" };

async function execute<T>(sql: Prisma.Sql) {
  return (await db.query<T>(sql.text, sql.values)).rows;
}

async function page(cursor: TimelineRow | null = null, overrides: Partial<ProjectRunsQuery> = {}) {
  const selected = { ...query, ...overrides };
  const candidates = timelineCandidatesSql("project_1", selected, null);
  return execute<TimelineRow>(
    Prisma.sql`${candidates} SELECT * FROM filtered WHERE ${timelineCursorSql(
      cursor
        ? {
            group: cursor.group,
            id: cursor.publicId,
            kind: cursor.kind,
            sortAt: new Date(cursor.sortAt).toISOString(),
          }
        : null,
      selected.order,
    )} ${timelineOrderSql(selected.order)} LIMIT ${selected.limit}`,
  );
}

beforeEach(async () => {
  // Prisma interprets timestamp-without-timezone values as UTC, independent of host TZ.
  db = new PGlite({ parsers: { 1114: (value) => new Date(`${value.replace(" ", "T")}Z`) } });
  await db.exec(`CREATE TABLE rank_check_runs (id text PRIMARY KEY, "publicId" text, "projectId" text, status text, outcome text, "blockedReason" text, "createdAt" timestamp, "startedAt" timestamp, "finishedAt" timestamp, "launchedAt" timestamp, "plannedFor" timestamp, "deletedAt" timestamp);
    CREATE TABLE rank_check_run_items ("runId" text, status text, "notBefore" timestamp);
    CREATE TABLE search_analytics_imports (id text PRIMARY KEY, "projectId" text, state text, "pausedReason" text, source text, "searchType" text, "createdAt" timestamp, "syncStartedAt" timestamp, "lastSyncStartedAt" timestamp, "lastSyncFinishedAt" timestamp);
    INSERT INTO rank_check_runs VALUES
      ('running','rcr_running','project_1','running',NULL,NULL,'2026-10-01','2026-10-05',NULL,'2026-10-05',NULL,NULL),
      ('planned_late','rcr_late','project_1','planned',NULL,NULL,'2026-10-01',NULL,NULL,NULL,'2026-10-08',NULL),
      ('planned_early','rcr_early','project_1','planned',NULL,NULL,'2026-10-06',NULL,NULL,NULL,'2026-10-07',NULL),
      ('queued','rcr_queued','project_1','queued',NULL,NULL,'2026-10-01',NULL,NULL,'2026-10-01','2026-10-01',NULL),
      ('finished_recent','rcr_recent','project_1','completed','succeeded',NULL,'2026-09-01','2026-09-01','2026-10-06','2026-09-01',NULL,NULL),
      ('finished_old','rcr_old','project_1','completed','failed',NULL,'2026-10-04','2026-10-04','2026-10-05','2026-10-04',NULL,NULL),
      ('skipped','rcr_skipped','project_1','completed','deferred','no_active_keywords','2026-10-01',NULL,'2026-10-04',NULL,'2026-10-08',NULL),
      ('cancelled','rcr_cancelled','project_1','cancelled',NULL,NULL,'2026-10-01',NULL,'2026-10-03',NULL,'2026-10-08',NULL),
      ('foreign','rcr_foreign','project_2','running',NULL,NULL,'2026-10-01','2026-10-01',NULL,'2026-10-01',NULL,NULL),
      ('deleted','rcr_deleted','project_1','running',NULL,NULL,'2026-10-01','2026-10-01',NULL,'2026-10-01',NULL,'2026-10-01');
    INSERT INTO rank_check_run_items VALUES ('queued','queued','2026-10-07'),('queued','queued','2026-10-09');
    INSERT INTO search_analytics_imports VALUES
      ('gsc_active','project_1','running',NULL,'gsc','web','2026-10-01','2026-10-04',NULL,NULL),
      ('gsc_history','project_1','completed',NULL,'gsc','web','2026-09-01','2026-09-01',NULL,'2026-10-06'),
      ('ga4_excluded','project_1','running',NULL,'ga4','web','2026-10-01','2026-10-01',NULL,NULL);
  `);
});
afterEach(async () => {
  await db.close();
});

describe("timeline database ordering", () => {
  it("orders groups before LIMIT, uses queued notBefore and completion dates, and pages ties once", async () => {
    const ids: string[] = [];
    let cursor: TimelineRow | null = null;
    for (let index = 0; index < 12; index += 1) {
      const rows = await page(cursor);
      if (!rows.length) break;
      ids.push(...rows.map((row) => row.publicId));
      cursor = rows.at(-1) ?? null;
    }
    expect(ids).toEqual([
      "gsc_active",
      "rcr_running",
      "rcr_early",
      "rcr_queued",
      "rcr_late",
      "gsc_history",
      "rcr_recent",
      "rcr_old",
      "rcr_skipped",
      "rcr_cancelled",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps attention inside chronological groups and respects explicit direction and section", async () => {
    expect((await page(null, { status: "attention" })).map((row) => row.publicId)).toEqual([
      "rcr_old",
    ]);
    expect(
      (await page(null, { section: "upcoming", order: "desc", limit: 10 })).map(
        (row) => row.publicId,
      ),
    ).toEqual(["rcr_late", "rcr_early", "rcr_queued"]);
    expect((await page(null, { status: "skipped" })).map((row) => row.publicId)).toEqual([
      "rcr_skipped",
    ]);
  });

  it("applies the live GSC status before filtering and counting", async () => {
    const snapshot = {
      id: "gsc_active",
      state: "running",
      presentation: { kind: "waiting_worker" },
    } as Parameters<typeof timelineCandidatesSql>[2];
    const sql = timelineCandidatesSql(
      "project_1",
      { ...query, source: "search_console", status: "attention" },
      snapshot,
    );
    expect(await execute(Prisma.sql`${sql} SELECT "publicId", "statusKey" FROM filtered`)).toEqual([
      { publicId: "gsc_active", statusKey: "delayed" },
    ]);
    expect(await execute(Prisma.sql`${sql} SELECT COUNT(*)::int AS total FROM filtered`)).toEqual([
      { total: 1 },
    ]);
  });
});
