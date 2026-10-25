import { runStoreConformance, runStoreScalingConformance } from "@usagekit/store/conformance";
import { Client } from "pg";
import { afterAll, expect, test, vi } from "vitest";
import { Prisma, transactions } from "./host-sql";
import {
  closeConformanceFixturePool,
  createConformanceFixture,
  createScalingFixture,
} from "./test-fixture";

// The published conformance suite runs 1000 generated cases per property in CI.
if (process.env.CI === "true") vi.setConfig({ testTimeout: 600_000 });

test("conformance cases reuse a schema with empty accounting tables", async () => {
  const opening = createConformanceFixture();
  await expect(createConformanceFixture()).rejects.toThrow("already active");
  const first = await opening;
  const schema = first.schema;
  try {
    await transactions(first.client(), schema, first.counters).write((sql) =>
      sql.execute(Prisma.sql`INSERT INTO queued_rank_check_tasks(id) VALUES('fixture')`),
    );
  } finally {
    await first.close();
  }
  const second = await createConformanceFixture();
  try {
    expect(second.schema).toBe(schema);
    const [row] = await transactions(second.client(), schema, second.counters).read((sql) =>
      sql.query<{ count: bigint }>(
        Prisma.sql`SELECT count(*) AS count FROM queued_rank_check_tasks`,
      ),
    );
    expect(row?.count).toBe(0n);
  } finally {
    await second.close();
  }
});

test("conformance cleanup remains atomic after waiting more than five seconds for a table lock", async () => {
  const first = await createConformanceFixture();
  const schema = first.schema;
  expect(schema).toMatch(/^metering_[a-f0-9]{32}$/);
  const blocker = new Client({ connectionString: first.url });
  let closing: Promise<{ ok: true } | { error: unknown }> | undefined;
  let closed = false;
  let second: Awaited<ReturnType<typeof createConformanceFixture>> | undefined;
  try {
    await blocker.connect();
    await transactions(first.client(), schema, first.counters).write((sql) =>
      sql.execute(Prisma.sql`INSERT INTO queued_rank_check_tasks(id) VALUES('blocked-cleanup')`),
    );
    await blocker.query("BEGIN");
    const {
      rows: [{ pid }],
    } = await blocker.query("SELECT pg_backend_pid() AS pid");
    await blocker.query(`LOCK TABLE "${schema}"."queued_rank_check_tasks" IN ACCESS SHARE MODE`);
    // Observe rejection immediately; the old transaction wrapper expires before unlock.
    closing = first.close().then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ error }),
    );
    await expect
      .poll(
        async () => {
          // This observer holds a transaction; refresh statistics before reading active query text.
          await blocker.query("SELECT pg_stat_clear_snapshot()");
          const {
            rows: [{ waiting }],
          } = await blocker.query(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE $1=ANY(pg_blocking_pids(a.pid)) AND a.query LIKE '%TRUNCATE TABLE%') AS waiting",
            [pid],
          );
          return waiting;
        },
        { timeout: 4000, interval: 10 },
      )
      .toBe(true);
    const blockedAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 5500));
    expect(performance.now() - blockedAt).toBeGreaterThan(5000);
    await blocker.query("COMMIT");
    expect(await closing).toEqual({ ok: true });
    closed = true;
    second = await createConformanceFixture();
    expect(second.schema).toBe(schema);
    const [row] = await transactions(second.client(), schema, second.counters).read((sql) =>
      sql.query<{ count: bigint }>(
        Prisma.sql`SELECT count(*) AS count FROM queued_rank_check_tasks`,
      ),
    );
    expect(row?.count).toBe(0n);
  } finally {
    try {
      await blocker.query("ROLLBACK");
    } finally {
      try {
        await blocker.end();
      } finally {
        await closing;
        if (second) await second.close();
        else if (!closed) await first.close();
      }
    }
  }
});

runStoreConformance(createConformanceFixture, {
  durable: true,
  rollingWindows: false,
  maxMoneyUnits: 2n ** 63n - 1n,
  maxQuantityScale: 18,
});

runStoreScalingConformance(createScalingFixture);
afterAll(async () => {
  try {
    await closeConformanceFixturePool();
  } finally {
    vi.resetConfig();
  }
});
