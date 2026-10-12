import { expect, test, vi } from "vitest";
import { runHistoricalImport, verifyHistoricalImport } from "./history-migration";
import { source } from "./history-test-data";
import { disposablePostgres } from "./store/disposable-postgres-test";
import { importHistoricalEvidence } from "./store/history";
import { Prisma, transactions } from "./store/sql";
import { command, receipt, request } from "./store/test-data";
import { fixture } from "./store/test-fixture";

test("before paid admission a restored snapshot reverses the import; after admission reconstruction preserves new evidence", async () => {
  const server = await disposablePostgres();
  vi.stubEnv("METERING_TEST_DATABASE_URL", server.url);
  try {
    const f = await fixture();
    const tx = () => transactions(f.client(), f.schema, f.counters);
    try {
      await tx().write((sql) =>
        sql.execute(
          Prisma.sql`INSERT INTO metering_legacy_usage_source VALUES('legacy',${JSON.stringify(source())}::jsonb)`,
        ),
      );
      const beforeAdmission = await server.dump(f.schema);
      await tx().write((sql) => runHistoricalImport(sql, "test", 10));
      await tx().write((sql) => runHistoricalImport(sql, "test", 10));
      await tx().read(verifyHistoricalImport);
      await f.client().$executeRaw(Prisma.sql`DROP SCHEMA ${Prisma.raw(f.schema)} CASCADE`);
      await server.restore(beforeAdmission);
      await f.restart();
      expect(
        await tx().read((sql) => sql.query(Prisma.sql`SELECT count(*) FROM metering_operation`)),
      ).toEqual([{ count: 0n }]);
      expect(
        await tx().read((sql) =>
          sql.query(Prisma.sql`SELECT cursor,verified_at FROM metering_history_progress`),
        ),
      ).toEqual([{ cursor: "", verified_at: null }]);
      // After a new paid call, reconstruction must include its evidence instead of restoring the old snapshot.
      const reserved = await f.store.reserve(request("new-paid-call"));
      if (reserved.outcome !== "reserved") throw new Error("Reservation failed");
      const grant = await f.store.markDispatchIntent({
        ...command(reserved.operation),
        holder: "worker",
        leaseTtlMs: 1000,
      });
      if (!("granted" in grant) || !grant.granted) throw new Error("Intent failed");
      const settled = await f.store.settle({
        ...command(grant.operation),
        authority: { kind: "lease", leaseId: grant.lease.leaseId },
        receipt: { ...receipt(), providerRequestId: "original-provider-native-id" },
      });
      if (settled.outcome !== "settled") throw new Error("Settlement failed");
      const reconstructed = await fixture();
      try {
        const sql = transactions(
          reconstructed.client(),
          reconstructed.schema,
          reconstructed.counters,
        );
        const input = {
          migrationId: "rollback-reconstruction",
          sourceId: "new-paid-call",
          sourceHash: "fixture",
          operation: settled.operation,
          cutoverAt: f.clock.now().toISOString(),
        };
        expect(await sql.write((tx) => importHistoricalEvidence(tx, input))).toMatchObject({
          outcome: "imported",
          replayed: false,
        });
        expect(await sql.write((tx) => importHistoricalEvidence(tx, input))).toMatchObject({
          outcome: "imported",
          replayed: true,
        });
        expect(
          await reconstructed.store.getOperation({
            namespace: "test",
            principal: "u1",
            operationId: "new-paid-call",
          }),
        ).toEqual(settled.operation);
        const totals = await reconstructed.store.aggregate({
          scope: { kind: "namespace", namespace: "test" },
          from: "2026-09-01T00:00:00Z",
          to: "2026-10-01T00:00:00Z",
          units: ["requests"],
          groupBy: [],
        });
        expect(totals.rows).toHaveLength(1);
        expect(totals.rows[0]?.cost.money?.units).toBe(1n);
        expect(
          await sql.read((tx) => tx.query(Prisma.sql`SELECT count(*) FROM metering_receipt`)),
        ).toEqual([{ count: 1n }]);
      } finally {
        await reconstructed.close();
      }
    } finally {
      await f.close();
    }
  } finally {
    vi.unstubAllEnvs();
    await server.close();
  }
});
