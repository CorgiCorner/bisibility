import { expect, test } from "vitest";
import { source } from "./history-test-data";
import { runHistoricalImport, verifyHistoricalImport } from "./host-history-migration";
import { killAtBarrier } from "./store/crash-test-child";
import { Prisma, transactions } from "./store/host-sql";
import { fixture } from "./store/test-fixture";

test.each(["history_batch", "history_reference", "history_verification"])(
  "SIGKILL during %s resumes the cursor and rewrites references exactly once",
  async (phase) => {
    const f = await fixture();
    const tx = () => transactions(f.client(), f.schema, f.counters);
    try {
      await tx().write(async (sql) => {
        await sql.execute(
          Prisma.sql`CREATE TABLE ai_tracking_samples(id text, "projectId" text, receipt jsonb)`,
        );
        for (const id of ["a", "b", "c"]) {
          await sql.execute(
            Prisma.sql`INSERT INTO metering_legacy_usage_source VALUES(${id},${JSON.stringify(source({ id, providerRequestId: `native-${id}` }))}::jsonb)`,
          );
          await sql.execute(
            Prisma.sql`INSERT INTO metering_legacy_reference_source VALUES('ai_sample',${id},${id},'{}')`,
          );
          await sql.execute(
            Prisma.sql`INSERT INTO ai_tracking_samples VALUES(${id},'project',${JSON.stringify({ providerCostEntryId: id })}::jsonb)`,
          );
        }
        await sql.execute(
          Prisma.sql`INSERT INTO metering_legacy_setting_source VALUES('project','project','{"id":"project","budgetCapCents":"20"}')`,
        );
      });
      await tx().write((sql) => runHistoricalImport(sql, "test", 1));
      if (phase === "history_verification")
        await tx().write((sql) => runHistoricalImport(sql, "test", 10));
      await killAtBarrier(f.url, f.schema, phase);
      await f.restart();
      const count = phase === "history_verification" ? 3n : 1n;
      const before = await tx().read((sql) =>
        sql.query<{ count: bigint }>(Prisma.sql`SELECT count(*) FROM metering_operation`),
      );
      expect(before).toEqual([{ count }]);
      const progress = await tx().read((sql) =>
        sql.query(Prisma.sql`SELECT cursor,verified_at FROM metering_history_progress`),
      );
      expect(progress).toEqual([{ cursor: count === 1n ? "a" : "c", verified_at: null }]);
      for (;;) {
        if ((await tx().write((sql) => runHistoricalImport(sql, "test", 1))).done) break;
      }
      await tx().read(verifyHistoricalImport);
      const read = () =>
        tx().read((sql) =>
          sql.query(Prisma.sql`SELECT
        (SELECT count(*) FROM metering_operation) AS operations,
        (SELECT count(*) FROM metering_receipt) AS receipts,
        (SELECT count(*) FROM metering_history_reference) AS refs,
        (SELECT settled_value::text FROM metering_budget_usage WHERE budget_id='project:project:monthly') AS used`),
        );
      expect(await read()).toEqual([{ operations: 3n, receipts: 3n, refs: 3n, used: "37035" }]);
      await tx().write((sql) => runHistoricalImport(sql, "test", 1));
      expect(await read()).toEqual([{ operations: 3n, receipts: 3n, refs: 3n, used: "37035" }]);
      const references = await tx().read((sql) =>
        sql.query(Prisma.sql`SELECT id,receipt FROM ai_tracking_samples ORDER BY id`),
      );
      expect(references).toEqual(
        ["a", "b", "c"].map((id) => ({
          id,
          receipt: {
            providerCostEntryId: null,
            operationRef: { version: 1, namespace: "test", operationId: `legacy:${id}` },
          },
        })),
      );
    } finally {
      await f.close();
    }
  },
);
