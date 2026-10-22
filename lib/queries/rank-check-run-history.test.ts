import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { findHistoryRunRows } from "./rank-check-run-history";

let pg: PGlite;
beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE rank_check_runs ("publicId" text,"projectId" text,status text,outcome text,"createdAt" timestamp,"finishedAt" timestamp,"launchedAt" timestamp,"deletedAt" timestamp);
 INSERT INTO rank_check_runs VALUES
 ('legacy','project','completed','cancelled','2026-10-01','2026-10-02','2026-10-01',NULL),
 ('legacy_unlaunched','project','completed','cancelled','2026-10-01','2026-10-02',NULL,NULL),
 ('cancelled','project','cancelled',NULL,'2026-10-01','2026-10-02','2026-10-01',NULL),
 ('partial','project','cancelled','partial','2026-10-01','2026-10-02','2026-10-01',NULL),
 ('completed','project','completed','succeeded','2026-10-01','2026-10-02','2026-10-01',NULL),
 ('foreign','other','completed','cancelled','2026-10-01','2026-10-02','2026-10-01',NULL),
 ('deleted','project','completed','cancelled','2026-10-01','2026-10-02','2026-10-01','2026-10-03');`);
});
afterEach(async () => pg.close());
it.each([
  [undefined, ["cancelled", "completed", "legacy", "legacy_unlaunched", "partial"]],
  [["cancelled"], ["cancelled", "legacy", "legacy_unlaunched", "partial"]],
  [["completed"], ["completed"]],
  [
    ["completed", "cancelled"],
    ["cancelled", "completed", "legacy", "legacy_unlaunched", "partial"],
  ],
] as const)("filters history by canonical terminal state %j", async (statuses, expected) => {
  const db = {
    $queryRaw: async (sql: { text: string; values: unknown[] }) =>
      (await pg.query(sql.text, sql.values)).rows,
    rankCheckRun: { findMany: async () => (await pg.query("SELECT * FROM rank_check_runs")).rows },
  };
  for (const includeUnlaunched of [false, true]) {
    const rows = await findHistoryRunRows(
      "project",
      statuses,
      null,
      20,
      includeUnlaunched,
      db as never,
    );
    expect(rows.map((row) => row.publicId).sort()).toEqual(expected);
  }
});
