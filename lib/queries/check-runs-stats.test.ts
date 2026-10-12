import { Prisma } from "@/lib/generated/prisma/client";
import { createUsageTables, seedTestUsage } from "@/lib/metering/usage.test-fixture";
import { canonicalUsageSql } from "@/lib/metering/usage-sql";
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
  `);
  await createUsageTables(db);
  const rows = [
    { id: "ledger_1", projectId: "project", keywordId: "keyword", costCents: 1.25 },
    { id: "ledger_2", projectId: "project", keywordId: "deleted_keyword", costCents: 0.5 },
    { id: "ledger_3", projectId: "project", costCents: 40, measurementStatus: "unknown" },
    { id: "ledger_4", projectId: "project", costCents: 100, cached: true },
    { id: "ledger_5", projectId: "project", costCents: 5, feature: "keyword_research" },
    { id: "ledger_6", projectId: "other", costCents: 100 },
    { id: "ledger_7", projectId: "project", costCents: 100, createdAt: "2026-08-22T10:00Z" },
  ];
  for (const row of rows) await seedTestUsage(db, { createdAt: "2026-09-22T10:00Z", ...row });
  mocks.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if ("text" in strings)
      return (
        await db.query(
          (strings as unknown as { text: string }).text,
          (strings as unknown as { values: unknown[] }).values,
        )
      ).rows;
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
  const rows = await mocks.query(
    Prisma.sql`SELECT "keywordId" FROM (${canonicalUsageSql()}) usage WHERE "projectId"='project' AND feature='rank_check'`,
  );
  expect(rows).toEqual(
    expect.arrayContaining([expect.objectContaining({ keywordId: "deleted_keyword" })]),
  );
});
