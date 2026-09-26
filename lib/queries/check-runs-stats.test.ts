import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { loadCheckRunsSummary } from "./check-runs-stats";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.query,
    rankCheck: { count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]) },
  },
}));

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE keywords (id text PRIMARY KEY, "projectId" text);
    CREATE TABLE rank_checks (
      "keywordId" text, "checkedAt" timestamptz, "costCents" numeric,
      "estimatedCostCents" numeric, status text, "deferredReason" text,
      "viaFallback" boolean DEFAULT false, attempts jsonb, provider text DEFAULT 'dataforseo'
    );
    CREATE TABLE provider_cost_entries (
      id text, "projectId" text, "keywordId" text, feature text, "createdAt" timestamptz,
      "costCents" numeric, cached boolean DEFAULT false, "measurementStatus" text DEFAULT 'recorded'
    );
    INSERT INTO keywords VALUES ('keyword', 'project'), ('other', 'other-project');
    INSERT INTO rank_checks ("keywordId", "checkedAt", "costCents", "estimatedCostCents", status)
    VALUES
      ('keyword', '2026-09-22T10:00Z', 1.25, 5, 'completed'),
      ('keyword', '2026-09-22T10:00Z', NULL, 10, 'completed'),
      ('keyword', '2026-09-22T10:00Z', 0, 20, 'completed'),
      ('keyword', '2026-09-22T10:00Z', NULL, 30, 'running'),
      ('keyword', '2026-09-22T10:00Z', 0.5, 5, 'failed'),
      ('other', '2026-09-22T10:00Z', 100, 100, 'completed'),
      ('keyword', '2026-08-22T10:00Z', 100, 100, 'completed');
    INSERT INTO provider_cost_entries
      (id, "projectId", "keywordId", feature, "createdAt", "costCents", cached, "measurementStatus")
    VALUES
      ('ledger_1', 'project', 'keyword', 'rank_check', '2026-09-22T10:00Z', 1.25, false, 'recorded'),
      ('ledger_2', 'project', 'deleted_keyword', 'rank_check', '2026-09-22T10:00Z', 0.5, false, 'recorded'),
      ('ledger_3', 'project', NULL, 'rank_check', '2026-09-22T10:00Z', 40, false, 'unknown'),
      ('ledger_4', 'project', NULL, 'rank_check', '2026-09-22T10:00Z', 100, true, 'recorded'),
      ('ledger_5', 'project', NULL, 'keyword_research', '2026-09-22T10:00Z', 5, false, 'recorded'),
      ('ledger_6', 'other', NULL, 'rank_check', '2026-09-22T10:00Z', 100, false, 'recorded'),
      ('ledger_7', 'project', NULL, 'rank_check', '2026-08-22T10:00Z', 100, false, 'recorded');
  `);
  mocks.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, "");
    return (await db.query(sql, values)).rows;
  });
});
afterAll(async () => db.close());

it("sums confirmed ledger rank-check spend without substituting estimates", async () => {
  const result = await loadCheckRunsSummary(
    "project",
    { start: new Date("2026-09-01T00:00Z"), end: new Date("2026-10-01T00:00Z") },
    Promise.resolve([]),
  );
  expect(result.spendCents).toBe(1.75);
});

it("counts ledger spend for a deleted keyword because the ledger carries no keyword join", async () => {
  const rows = await mocks.query`
    SELECT "keywordId" FROM provider_cost_entries WHERE "projectId" = 'project' AND feature = 'rank_check'
  `;
  expect(rows).toEqual(
    expect.arrayContaining([expect.objectContaining({ keywordId: "deleted_keyword" })]),
  );
});
