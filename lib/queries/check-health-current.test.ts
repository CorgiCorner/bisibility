import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { loadCheckHealthStats } from "./check-health";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: mocks.query } }));
vi.mock("./_auth", () => ({}));
vi.mock("./workspace-request-data", () => ({}));
let db: PGlite;
const since = new Date("2026-09-21T12:00:00Z");

beforeAll(() => {
  db = new PGlite();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(`
    DROP TABLE IF EXISTS rank_checks, keywords;
    CREATE TABLE keywords (id text PRIMARY KEY, "projectId" text, text text, "archivedAt" timestamptz);
    CREATE TABLE rank_checks (id text PRIMARY KEY, "publicId" text, "keywordId" text,
      "checkedAt" timestamptz, status text, error text, "errorCode" text, provider text);
    INSERT INTO keywords VALUES ('active', 'project', 'active', NULL),
      ('archived', 'project', 'archived', '2026-09-22T09:00Z'),
      ('other', 'other-project', 'other', NULL);
    INSERT INTO rank_checks VALUES
      ('a', 'check_old', 'active', '2026-09-22T07:00Z', 'failed', 'timeout', 'timeout', 'serpapi'),
      ('b', 'check_archived', 'archived', '2026-09-22T08:00Z', 'failed', NULL, NULL, 'serpapi'),
      ('c', 'check_other', 'other', '2026-09-22T09:00Z', 'failed', NULL, NULL, 'serpapi');
  `);
  mocks.query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, "");
    return (await db.query(sql, values)).rows;
  });
});

it("reports only current failures of tracked keywords in this project", async () => {
  expect(await loadCheckHealthStats("project", since)).toMatchObject({
    currentFailedCount: 1,
    latestCurrentFailedCheckId: "check_old",
  });
});

it("clears a recovered failure while retaining the historical daily count", async () => {
  await db.exec(`INSERT INTO rank_checks VALUES
    ('d', 'check_success', 'active', '2026-09-22T10:00Z', 'completed', NULL, NULL, 'serpapi')`);
  expect(await loadCheckHealthStats("project", since)).toMatchObject({
    currentFailedCount: 0,
    latestCurrentFailedCheckId: null,
    failedCount: 2,
  });
});

it("clears removed keywords and identifies a new failure after recovery", async () => {
  await db.exec(`DELETE FROM keywords WHERE id = 'active'`);
  expect(await loadCheckHealthStats("project", since)).toMatchObject({
    currentFailedCount: 0,
    latestCurrentFailedCheckId: null,
  });
  await db.exec(`INSERT INTO keywords VALUES ('active', 'project', 'active', NULL);
    INSERT INTO rank_checks VALUES
      ('d', 'check_success', 'active', '2026-09-22T10:00Z', 'completed', NULL, NULL, 'serpapi'),
      ('e', 'check_new', 'active', '2026-09-22T11:00Z', 'failed', NULL, NULL, 'serpapi')`);
  expect(await loadCheckHealthStats("project", since)).toMatchObject({
    currentFailedCount: 1,
    latestCurrentFailedCheckId: "check_new",
  });
});
