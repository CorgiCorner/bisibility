import { expect, test } from "vitest";
import { historicalOperation } from "./history-mapping";
import { source } from "./history-test-data";
import { runHistoricalImport, verifyHistoricalImport } from "./host-history-migration";
import { importHistoricalEvidence } from "./store/host-history";
import { Prisma, transactions } from "./store/host-sql";
import { fixture } from "./store/test-fixture";

test("bounded migration translates namespaced references, resumes and verifies all historical months", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    const sources = [
      source({ id: "a", createdAt: "2026-09-30T23:59:59.999Z" }),
      source({ id: "b" }),
      source({ id: "c", measurementStatus: "unknown" }),
    ];
    await tx.write(async (sql) => {
      for (const s of sources)
        await sql.execute(
          Prisma.sql`INSERT INTO metering_legacy_usage_source VALUES(${s.id},${JSON.stringify(s)}::jsonb)`,
        );
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_setting_source VALUES('project','project','{"id":"project","budgetCapCents":"2","providerAllocationsInitializedAt":"2026-09-01"}'::jsonb)`,
      );
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_reference_source VALUES('ai_sample','sample','a','{}'::jsonb)`,
      );
    });
    const run = () => tx.write((sql) => runHistoricalImport(sql, "test", 1));
    while (!(await run()).done) {}
    await f.restart();
    expect(await run()).toMatchObject({ done: true });
    await tx.read((sql) => verifyHistoricalImport(sql));
    expect(
      await tx.read((sql) =>
        sql.query(
          Prisma.sql`SELECT source_id,namespace FROM metering_history_import ORDER BY source_id`,
        ),
      ),
    ).toEqual([
      { source_id: "a", namespace: "test" },
      { source_id: "b", namespace: "test" },
      { source_id: "c", namespace: "test" },
    ]);
    expect(
      await tx.read((sql) =>
        sql.query(Prisma.sql`SELECT namespace,operation_id FROM metering_history_reference`),
      ),
    ).toEqual([{ namespace: "test", operation_id: "legacy:a" }]);
    expect(
      await tx.read((sql) =>
        sql.query(
          Prisma.sql`SELECT epoch,settled_value::text AS used FROM metering_budget_usage WHERE budget_id='project:project:monthly' ORDER BY epoch`,
        ),
      ),
    ).toEqual([
      { epoch: "2026-09", used: "12345" },
      { epoch: "2026-10", used: "12345" },
    ]);
    await tx.write((sql) =>
      sql.execute(Prisma.sql`UPDATE metering_budget_usage SET settled_value=settled_value+1`),
    );
    await expect(tx.read((sql) => verifyHistoricalImport(sql))).rejects.toThrow("counter");
  } finally {
    await f.close();
  }
});

test("verification refuses a missing mapping and a changed source hash", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await tx.write((sql) =>
      sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_usage_source VALUES('legacy',${JSON.stringify(source())}::jsonb)`,
      ),
    );
    await expect(tx.read((sql) => verifyHistoricalImport(sql))).rejects.toThrow("mapping");
    await tx.write((sql) =>
      importHistoricalEvidence(sql, {
        migrationId: "20261011021000_accounting_history",
        sourceId: "legacy",
        sourceHash: "wrong",
        operation: historicalOperation(source(), "test", "2026-10-10T00:00:00.000Z"),
        cutoverAt: "2026-10-10T00:00:00.000Z",
      }),
    );
    await expect(tx.read((sql) => verifyHistoricalImport(sql))).rejects.toThrow("hash");
  } finally {
    await f.close();
  }
});
test("old canonical receipts gain project valuation and retain imported normalization evidence", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    const projected = historicalOperation(source(), "test", "2026-10-10T00:00:00.000Z");
    const op = {
      ...projected,
      operationId: "legacy",
      receipts: projected.receipts.map((r) => ({
        ...r,
        measurements: r.measurements.filter((m) => m.unit !== "budget_cents"),
      })),
    };
    await tx.write((sql) =>
      importHistoricalEvidence(sql, {
        migrationId: "prior",
        sourceId: "legacy",
        sourceHash: "old",
        operation: op,
        cutoverAt: op.updatedAt,
      }),
    );
    await tx.write(async (sql) => {
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_usage_source VALUES('legacy',${JSON.stringify(source())}::jsonb)`,
      );
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_setting_source VALUES('project','project','{"id":"project","budgetCapCents":"2"}'::jsonb)`,
      );
    });
    await tx.write((sql) => runHistoricalImport(sql, "test", 1));
    await tx.read((sql) => verifyHistoricalImport(sql));
    const values = await tx.read((sql) =>
      sql.query<{ used: string }>(
        Prisma.sql`SELECT settled_value::text AS used FROM metering_budget_usage WHERE budget_id='project:project:monthly'`,
      ),
    );
    expect(values).toEqual([{ used: "12345" }]);
  } finally {
    await f.close();
  }
});
test("unknown historical provider cannot leave an uncounted connection with fresh headroom", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await tx.write((sql) =>
      sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_usage_source VALUES('legacy',${JSON.stringify(source({ provider: null }))}::jsonb)`,
      ),
    );
    await tx.write((sql) => runHistoricalImport(sql, "test", 1));
    const gates = await tx.read((sql) =>
      sql.query<{ scope_kind: string }>(
        Prisma.sql`SELECT scope_kind FROM metering_budget WHERE unit='paid_attempts' ORDER BY scope_kind`,
      ),
    );
    expect(gates).toEqual([{ scope_kind: "connection" }, { scope_kind: "group" }]);
  } finally {
    await f.close();
  }
});
test("empty history still verifies every migrated cap and refuses namespace drift on replay", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await tx.write((sql) =>
      sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_setting_source VALUES('project','project','{"id":"project","budgetCapCents":"2"}'::jsonb)`,
      ),
    );
    await tx.write((sql) => runHistoricalImport(sql, "test", 1));
    await expect(tx.write((sql) => runHistoricalImport(sql, "different", 1))).rejects.toThrow(
      "namespace",
    );
    await tx.write((sql) =>
      sql.execute(
        Prisma.sql`UPDATE metering_budget SET body=jsonb_set(body,'{onExceed}','"allow"'::jsonb)`,
      ),
    );
    await expect(tx.read((sql) => verifyHistoricalImport(sql))).rejects.toThrow(
      "settings conflict",
    );
  } finally {
    await f.close();
  }
});
test("verification rejects a changed retained reference principal or receipt", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await tx.write(async (sql) => {
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_usage_source VALUES('legacy',${JSON.stringify(source())}::jsonb)`,
      );
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_reference_source VALUES('ai_sample','sample','legacy','{}')`,
      );
    });
    await tx.write((sql) => runHistoricalImport(sql, "test", 1));
    await tx.write((sql) =>
      sql.execute(Prisma.sql`UPDATE metering_history_reference SET principal='wrong-payer'`),
    );
    await expect(tx.read((sql) => verifyHistoricalImport(sql))).rejects.toThrow("reference");
  } finally {
    await f.close();
  }
});
test("unknown historical customer cost blocks platform work even without configured caps", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await tx.write((sql) =>
      sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_usage_source VALUES('legacy',${JSON.stringify(source({ credentialSource: "hosted", priceCents: "0.0000" }))}::jsonb)`,
      ),
    );
    await tx.write((sql) => runHistoricalImport(sql, "test", 1));
    expect(
      await tx.read((sql) =>
        sql.query(Prisma.sql`SELECT unit FROM metering_budget WHERE unit='paid_attempts'`),
      ),
    ).toHaveLength(2);
  } finally {
    await f.close();
  }
});
test("an unset allocation unit retains the provider's native quota semantics", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await tx.write((sql) =>
      sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_setting_source VALUES('connection','connection','{"id":"connection","provider":"serpapi","projectId":"project","allocationUnit":null,"allocationAmountPerMonth":"10","programmaticAllocationAmountPerMonth":null,"creditsAllocationAmountPerMonth":null,"creditsProgrammaticAllocationAmountPerMonth":null}'::jsonb)`,
      ),
    );
    await tx.write((sql) => runHistoricalImport(sql, "test", 1));
    expect(
      await tx.read((sql) =>
        sql.query(
          Prisma.sql`SELECT unit,limit_scale FROM metering_budget WHERE budget_id='own-connection:connection:app'`,
        ),
      ),
    ).toEqual([{ unit: "units", limit_scale: 6 }]);
  } finally {
    await f.close();
  }
});
test("history import rewrites persisted AI JSON after retiring its legacy relation", async () => {
  const f = await fixture();
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await tx.write(async (sql) => {
      await sql.execute(
        Prisma.sql`CREATE TABLE ai_tracking_samples(id text,"projectId" text,receipt jsonb)`,
      );
      await sql.execute(
        Prisma.sql`INSERT INTO ai_tracking_samples VALUES('sample','project','{"providerCostEntryId":"legacy","amountUsd":"0.01","state":"confirmed"}')`,
      );
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_usage_source VALUES('legacy',${JSON.stringify(source())}::jsonb)`,
      );
      await sql.execute(
        Prisma.sql`INSERT INTO metering_legacy_reference_source VALUES('ai_sample','sample','legacy','{}')`,
      );
    });
    await tx.write((sql) => runHistoricalImport(sql, "test", 10));
    const [row] = await tx.read((sql) =>
      sql.query<{ receipt: unknown }>(Prisma.sql`SELECT receipt FROM ai_tracking_samples`),
    );
    expect(row).toMatchObject({
      receipt: {
        providerCostEntryId: null,
        operationRef: { version: 1, namespace: "test", operationId: "legacy:legacy" },
      },
    });
  } finally {
    await f.close();
  }
});
