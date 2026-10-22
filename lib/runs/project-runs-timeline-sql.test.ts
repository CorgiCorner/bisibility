import { Prisma } from "@/lib/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

beforeAll(async () => {
  // Prisma interprets timestamp-without-timezone values as UTC, independent of host TZ.
  db = new PGlite({ parsers: { 1114: (value) => new Date(`${value.replace(" ", "T")}Z`) } });
  await db.waitReady;
}, 30000);
beforeEach(async () => {
  await db.exec(
    `DROP TABLE IF EXISTS rank_check_runs, rank_check_run_items, search_analytics_imports, ai_tracking_runs, ai_tracking_samples`,
  );
  await db.exec(`CREATE TABLE rank_check_runs (id text PRIMARY KEY, "publicId" text, "projectId" text, status text, outcome text, "blockedReason" text, "createdAt" timestamp, "startedAt" timestamp, "finishedAt" timestamp, "launchedAt" timestamp, "plannedFor" timestamp, "deletedAt" timestamp);
    CREATE TABLE rank_check_run_items ("runId" text, status text, "notBefore" timestamp);
    CREATE TABLE search_analytics_imports (id text PRIMARY KEY, "projectId" text, state text, "pausedReason" text, source text, "searchType" text, "createdAt" timestamp, "syncStartedAt" timestamp, "lastSyncStartedAt" timestamp, "lastSyncFinishedAt" timestamp);
    CREATE TABLE ai_tracking_runs (id text PRIMARY KEY, "publicId" text, "projectId" text, state text, "createdAt" timestamp, "plannedAt" timestamp, "finishedAt" timestamp, "launchPayload" jsonb);
    CREATE TABLE ai_tracking_samples ("runId" text, "projectId" text, "claimedAt" timestamp, evidence jsonb);
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
afterAll(async () => {
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

describe("AI timeline union", () => {
  beforeEach(async () => {
    await db.exec(`INSERT INTO ai_tracking_runs VALUES
       ('ai_running','air_running','project_1','running','2026-10-05',null,null,'{}'),
       ('ai_waiting','air_waiting','project_1','planned','2026-10-01','2026-10-09',null,'{}'),
       ('ai_partial','air_partial','project_1','partial','2026-10-01',null,'2026-10-08','{}'),
       ('ai_cost','air_cost','project_1','skipped','2026-10-01',null,'2026-10-09','{"skipReason":"cost_limit_exceeded"}'),
       ('ai_cancel','air_cancel','project_1','cancelled','2026-10-01',null,'2026-10-07','{}'),
       ('ai_other','air_other','other_project','failed','2026-10-01',null,'2026-10-10','{}');
       INSERT INTO ai_tracking_samples VALUES ('ai_running','project_1','2026-10-06',null),('ai_cost','project_1',null,'{"providerStatus":"cost_limit_exceeded"}');`);
  });
  it("pages all three sources in a single stable server-side ordering", async () => {
    await db.exec(`INSERT INTO ai_tracking_runs VALUES ('tie_ai','air_tie','project_1','completed','2026-10-01',null,'2026-10-22','{}');
      INSERT INTO rank_check_runs VALUES ('tie_rank','rcr_tie','project_1','completed','succeeded',null,'2026-10-01',null,'2026-10-22','2026-10-01',null,null);
      INSERT INTO search_analytics_imports VALUES ('tie_gsc','project_1','completed',null,'gsc','web','2026-10-01',null,null,'2026-10-22');`);
    const seen: string[] = [];
    let cursor: TimelineRow | null = null;
    for (;;) {
      const rows = await page(cursor);
      if (!rows.length) break;
      seen.push(...rows.map((row) => row.publicId));
      cursor = rows.at(-1) ?? null;
    }
    expect(seen).toContain("air_running");
    expect(seen).toContain("air_partial");
    expect(seen).not.toContain("air_other");
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.filter((id) => ["air_tie", "tie_gsc", "rcr_tie"].includes(id))).toEqual([
      "air_tie",
      "tie_gsc",
      "rcr_tie",
    ]);
    expect(seen.indexOf("air_running")).toBeLessThan(seen.indexOf("air_waiting"));
    expect(seen.indexOf("air_waiting")).toBeLessThan(seen.indexOf("air_partial"));
  });
  it("keeps AI source, attention, history and counts on the same predicates", async () => {
    const rows = await page(null, {
      source: "ai_tracking",
      status: "attention",
      section: "history",
      limit: 50,
    });
    expect(rows.map((row) => row.publicId)).toEqual(["air_cost", "air_partial"]);
    const sql = timelineCandidatesSql(
      "project_1",
      { ...query, source: "ai_tracking", status: "attention", section: "history" },
      null,
    );
    expect(
      (
        await execute<{ total: number }>(
          Prisma.sql`${sql} SELECT COUNT(*)::int AS total FROM filtered`,
        )
      )[0].total,
    ).toBe(rows.length);
  });
});

it("classifies completed/cancelled legacy outcomes as cancelled history", async () => {
  await db.exec(
    `INSERT INTO rank_check_runs VALUES ('legacy','rcr_legacy','project_1','completed','cancelled',NULL,'2026-10-01',NULL,'2026-10-07','2026-10-01',NULL,NULL);`,
  );
  for (const source of ["all", "rank_checks"] as const) {
    const rows = await page(null, { source, status: "cancelled", section: "history", limit: 20 });
    expect(rows.map((row) => row.publicId).sort()).toEqual(["rcr_cancelled", "rcr_legacy"]);
  }
});

it("gives cancellation precedence over an old no-active-keywords reason", async () => {
  await db.exec(
    `INSERT INTO rank_check_runs VALUES ('legacy_reason','rcr_legacy_reason','project_1','completed','cancelled','no_active_keywords','2026-10-01',NULL,'2026-10-07','2026-10-01',NULL,NULL);`,
  );
  expect(
    (await page(null, { status: "cancelled", limit: 20 })).map((row) => row.publicId),
  ).toContain("rcr_legacy_reason");
  expect((await page(null, { status: "skipped", limit: 20 })).map((row) => row.publicId)).toEqual([
    "rcr_skipped",
  ]);
});
