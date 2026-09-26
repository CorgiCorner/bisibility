import { runStoreConformance, runStoreScalingConformance } from "@usagekit/store/conformance";
import { afterAll, expect, test, vi } from "vitest";
import { Prisma, transactions } from "./sql";
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
      sql.execute(Prisma.sql`INSERT INTO metering_shadow(namespace,operation_id,project_id,connection_id,legacy,meter,settled)
        VALUES('test','fixture','project','connection','allowed','reserved','pending')`),
    );
  } finally {
    await first.close();
  }
  const second = await createConformanceFixture();
  try {
    expect(second.schema).toBe(schema);
    const [row] = await transactions(second.client(), schema, second.counters).read((sql) =>
      sql.query<{ count: bigint }>(Prisma.sql`SELECT count(*) AS count FROM metering_shadow`),
    );
    expect(row?.count).toBe(0n);
  } finally {
    await second.close();
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
