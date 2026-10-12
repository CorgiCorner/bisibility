import { expect, test } from "vitest";
import { historicalOperation } from "./history-mapping";
import { runHistoricalImport, verifyHistoricalImport } from "./history-migration";
import { source } from "./history-test-data";
import { importHistoricalEvidence } from "./store/history";
import { Prisma, transactions } from "./store/sql";
import { fixture } from "./store/test-fixture";

test.each([null, 5000n])(
  "imports a corrected native receipt after original cost %s",
  async (oldCost) => {
    const f = await fixture();
    try {
      const tx = transactions(f.client(), f.schema, f.counters);
      const legacy = source();
      const projected = historicalOperation(legacy, "test", "2026-10-10T00:00:00Z");
      const finalReceipt = {
        ...projected.receipts[0],
        id: "final",
        source: "dispatch" as const,
        supersedes: "first",
      };
      const operation = {
        ...projected,
        operationId: legacy.id,
        version: 2,
        receipts: [
          {
            ...finalReceipt,
            id: "first",
            supersedes: undefined,
            cost:
              oldCost === null
                ? { certainty: "unknown" as const, money: null }
                : {
                    certainty: "measured" as const,
                    money: { units: oldCost, currency: "USD" as const },
                  },
          },
          finalReceipt,
        ],
      };
      await tx.write(async (sql) => {
        await importHistoricalEvidence(sql, {
          migrationId: "prior",
          sourceId: legacy.id,
          sourceHash: "prior-proof",
          operation,
          cutoverAt: operation.updatedAt,
        });
        await sql.execute(
          Prisma.sql`INSERT INTO metering_legacy_usage_source VALUES(${legacy.id},${JSON.stringify(legacy)}::jsonb)`,
        );
      });
      await expect(tx.write((sql) => runHistoricalImport(sql, "test", 1))).resolves.toMatchObject({
        processed: 1,
      });
      await tx.read((sql) => verifyHistoricalImport(sql));
      const imported = await f.store.getOperation({
        namespace: "test",
        principal: operation.scope.principal,
        operationId: legacy.id,
      });
      expect(imported?.receipts.at(-1)?.cost.money?.units).toBe(12345n);
      expect(imported?.receipts).toHaveLength(3);
    } finally {
      await f.close();
    }
  },
);
