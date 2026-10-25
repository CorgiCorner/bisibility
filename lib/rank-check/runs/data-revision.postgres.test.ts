import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readRankDataRevision } from "./data-revision";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: query } }));

const container = `lu-revision-${randomUUID()}`;
const postgresPassword = randomUUID();
let pool: Pool;
const timestamp = "2026-10-24 10:00:00";

async function insert(id: string, project = "project_1", at = timestamp) {
  await pool.query(
    `INSERT INTO rank_check_runs (id, "projectId", "updatedAt", "startedAt", status)
    VALUES ($1, $2, $3, $3, 'completed')`,
    [id, project, at],
  );
}

describe("durable rank data revision in isolated PostgreSQL", () => {
  beforeAll(async () => {
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-d",
        "--name",
        container,
        "-e",
        "POSTGRES_DB=lu_revision_test",
        "-e",
        `POSTGRES_PASSWORD=${postgresPassword}`,
        "-p",
        "127.0.0.1::5432",
        "postgres:16-alpine",
      ],
      { stdio: "pipe" },
    );
    const address = execFileSync("docker", ["port", container, "5432/tcp"], {
      encoding: "utf8",
    }).trim();
    expect(address).toMatch(/^127\.0\.0\.1:\d+$/);
    process.stdout.write(`LU_REVISION_POSTGRES ${JSON.stringify({ container, address })}\n`);
    pool = new Pool({
      host: "127.0.0.1",
      port: Number(address.split(":").at(-1)),
      user: "postgres",
      password: postgresPassword,
      database: "lu_revision_test",
    });
    let ready = false;
    for (let attempt = 0; attempt < 40 && !ready; attempt++) {
      try {
        await pool.query("SELECT 1");
        ready = true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    if (!ready) throw new Error("Disposable PostgreSQL did not start.");
    query.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Prisma.sql(strings, ...values);
      return (await pool.query(sql.text, sql.values)).rows;
    });
  });
  afterAll(async () => {
    await pool?.end();
    execFileSync("docker", ["rm", "-f", "-v", container], { stdio: "pipe" });
  });
  beforeEach(async () => {
    await pool.query(`DROP TABLE IF EXISTS rank_check_runs;
      CREATE TABLE rank_check_runs (
        id text PRIMARY KEY, "projectId" text NOT NULL, "updatedAt" timestamp(3) NOT NULL,
        status text NOT NULL, outcome text, "startedAt" timestamp(3), "deletedAt" timestamp(3),
        "selectionSpec" jsonb, "selectionHash" text, "publicId" text,
        "completedCount" integer NOT NULL DEFAULT 0,
        "failedCount" integer NOT NULL DEFAULT 0, "deferredCount" integer NOT NULL DEFAULT 0,
        "cancelledCount" integer NOT NULL DEFAULT 0, "skippedCount" integer NOT NULL DEFAULT 0
      );
      CREATE INDEX run_project_status ON rank_check_runs ("projectId", status);
      CREATE INDEX run_project_started ON rank_check_runs ("projectId", "startedAt", id);`);
  });
  it("detects terminal runs missed entirely by the active set and survives new readers", async () => {
    const before = await readRankDataRevision("project_1");
    await insert("finished-between-snapshots");
    const after = await readRankDataRevision("project_1");
    expect(after).not.toBe(before);
    expect(after).toMatch(/^[a-f0-9]{64}$/);
    expect(await readRankDataRevision("project_1")).toBe(after);
  });
  it("detects equal-timestamp progress on an older run despite a newer watermark", async () => {
    await insert("old");
    await insert("new", "project_1", "2026-10-24 11:00:00");
    const before = await readRankDataRevision("project_1");
    await pool.query(`UPDATE rank_check_runs SET "completedCount" = 1 WHERE id = 'old'`);
    expect(await readRankDataRevision("project_1")).not.toBe(before);
  });
  it("isolates other projects including quoted project identifiers", async () => {
    await insert("own");
    const own = await readRankDataRevision("project_1");
    const empty = await readRankDataRevision("empty");
    await insert("foreign", "project_2");
    expect(await readRankDataRevision("project_1")).toBe(own);
    expect(await readRankDataRevision("project_1' OR true --")).toBe(empty);
    await pool.query(`UPDATE rank_check_runs SET "completedCount" = 10 WHERE id = 'foreign'`);
    expect(await readRankDataRevision("project_1")).toBe(own);
    await pool.query(`UPDATE rank_check_runs SET status = 'running', "startedAt" = NULL
      WHERE id = 'foreign'`);
    expect(await readRankDataRevision("project_1")).toBe(own);
  });
  it("excludes terminal changes older than the newest 25 started runs", async () => {
    for (let index = 0; index < 26; index++) await insert(String(index).padStart(3, "0"));
    const before = await readRankDataRevision("project_1");
    await pool.query(`UPDATE rank_check_runs SET "completedCount" = 1,
      "updatedAt" = '2026-10-25', "deletedAt" = '2026-10-25', outcome = 'partial'
      WHERE id = '000'`);
    expect(await readRankDataRevision("project_1")).toBe(before);
    await pool.query(`DELETE FROM rank_check_runs WHERE id = '000'`);
    expect(await readRankDataRevision("project_1")).toBe(before);
    await pool.query(`UPDATE rank_check_runs SET "completedCount" = 1 WHERE id = '001'`);
    expect(await readRankDataRevision("project_1")).not.toBe(before);
  });
  it.each(["queued", "running", "cancelling", "blocked"])(
    "includes progress on %s runs outside the newest started set",
    async (status) => {
      await insert("active", "project_1", "2026-01-01");
      await pool.query(`UPDATE rank_check_runs SET status = $1 WHERE id = 'active'`, [status]);
      for (let index = 0; index < 26; index++) await insert(`new_${index}`);
      const before = await readRankDataRevision("project_1");
      await pool.query(`UPDATE rank_check_runs SET "completedCount" = 1 WHERE id = 'active'`);
      expect(await readRankDataRevision("project_1")).not.toBe(before);
    },
  );
  it("includes null-start queued runs without crowding the newest started set", async () => {
    await insert("terminal");
    await pool.query(`INSERT INTO rank_check_runs (id, "projectId", "updatedAt", status)
      SELECT 'queued_' || n, 'project_1', timestamp '2026-10-24', 'queued'
      FROM generate_series(1, 30) n`);
    const before = await readRankDataRevision("project_1");
    await pool.query(`UPDATE rank_check_runs SET "completedCount" = 1 WHERE id = 'terminal'`);
    const late = await readRankDataRevision("project_1");
    expect(late).not.toBe(before);
    await pool.query(`UPDATE rank_check_runs SET "completedCount" = 1 WHERE id = 'queued_1'`);
    expect(await readRankDataRevision("project_1")).not.toBe(late);
  });
  it.each([
    '"completedCount" = 1',
    '"failedCount" = 1',
    '"deferredCount" = 1',
    '"cancelledCount" = 1',
    '"skippedCount" = 1',
    "outcome = 'partial'",
    "status = 'cancelled'",
    `"updatedAt" = '2026-10-25'`,
    `"deletedAt" = '2026-10-25'`,
  ])("detects same-millisecond retained terminal changes: %s", async (change) => {
    await insert("terminal");
    const before = await readRankDataRevision("project_1");
    await pool.query(`UPDATE rank_check_runs SET ${change} WHERE id = 'terminal'`);
    expect(await readRankDataRevision("project_1")).not.toBe(before);
  });
  it("keeps the token stable when physical row order changes", async () => {
    await insert("a");
    await insert("b");
    const before = await readRankDataRevision("project_1");
    await pool.query(`DELETE FROM rank_check_runs WHERE id = 'a'`);
    await insert("a");
    expect(await readRankDataRevision("project_1")).toBe(before);
  });
  it("detects hard deletion and soft deletion with the writer timestamp", async () => {
    await insert("retained");
    const before = await readRankDataRevision("project_1");
    await pool.query(`UPDATE rank_check_runs SET "deletedAt" = '2026-10-24 12:00:00',
      "updatedAt" = '2026-10-24 12:00:00' WHERE id = 'retained'`);
    const deleted = await readRankDataRevision("project_1");
    expect(deleted).not.toBe(before);
    await pool.query(`DELETE FROM rank_check_runs WHERE id = 'retained'`);
    expect(await readRankDataRevision("project_1")).not.toBe(deleted);
  });
  it.each([20_000, 100_000])(
    "bounds indexed revision reads with %i runs and noise projects",
    async (count) => {
      await pool.query(
        `INSERT INTO rank_check_runs
      (id, "projectId", "updatedAt", status, "startedAt", "selectionSpec", "selectionHash", "publicId")
      SELECT 'run_' || n, CASE WHEN n <= $1 THEN 'measured' ELSE 'noise_' || n % 10 END,
        timestamp '2026-01-01' + n * interval '1 hour', 'completed',
        timestamp '2026-01-01' + n * interval '1 hour',
        jsonb_build_object('kind', 'all', 'filters', repeat('x', 300)), repeat('a', 64), 'rcr_' || n
      FROM generate_series(1, $1::integer + 100000) n`,
        [count],
      );
      await pool.query("ANALYZE rank_check_runs");
      await readRankDataRevision("measured");
      const times: number[] = [];
      for (let call = 0; call < 50; call++) {
        const start = performance.now();
        await readRankDataRevision("measured");
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      const [strings, ...values] = query.mock.calls.at(-1)!;
      const sql = Prisma.sql(strings, ...values);
      const plan = await pool.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql.text}`,
        sql.values,
      );
      process.stdout.write(
        `LU_REVISION_BENCHMARK ${JSON.stringify({
          count,
          calls: 50,
          p50: times[24],
          p95: times[47],
          plan: plan.rows,
        })}\n`,
      );
      expect(times).toHaveLength(50);
      const nodes: Array<Record<string, unknown>> = [];
      function visit(node: Record<string, unknown>) {
        nodes.push(node);
        for (const child of (node.Plans ?? []) as Array<Record<string, unknown>>) visit(child);
      }
      visit(plan.rows[0]["QUERY PLAN"][0].Plan);
      expect(nodes.some((node) => node["Node Type"] === "Seq Scan")).toBe(false);
      expect(
        nodes.some((node) => node["Node Type"] === "Limit" && node["Actual Rows"] === 25),
      ).toBe(true);
      expect(nodes.some((node) => node["Index Name"] === "run_project_started")).toBe(true);
      expect(nodes.some((node) => node["Index Name"] === "run_project_status")).toBe(true);
    },
    120_000,
  );
});
