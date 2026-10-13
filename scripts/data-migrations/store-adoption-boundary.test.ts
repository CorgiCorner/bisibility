import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { expect, test, vi } from "vitest";
import { accountingHistoryMigration } from "./20261011021000_accounting_history";
import { computeDataMigrationChecksum, resolveActiveDataMigrations } from "./resolver";
import { runActiveDataMigrations } from "./runner";
import type { DataMigrationDatabase } from "./types";

const originalChecksum = "f3d9874cf0e546515b3d0a6a8947b1ad8670d270b5a7e83d50584a6b8b7d2b28";

async function migration() {
  return (
    await resolveActiveDataMigrations(
      dataMigrationManifest.filter((entry) => entry.id === accountingHistoryMigration.id),
      [accountingHistoryMigration],
    )
  )[0];
}

test("Store adoption preserves all 24 original accounting checksum inputs", async () => {
  expect(accountingHistoryMigration.checksumInputs).toHaveLength(24);
  expect(await computeDataMigrationChecksum(accountingHistoryMigration)).toBe(originalChecksum);
  expect((await migration()).checksum).toBe(originalChecksum);
});

test.each([originalChecksum, "b".repeat(64)])(
  "finished accounting ledger remains immutable with checksum %s",
  async (checksum) => {
    const entry = await migration();
    const run = vi.fn(entry.run),
      finalize = vi.fn(entry.finalize);
    const queries: string[] = [];
    const row = {
      id: entry.id,
      checksum,
      finishedAt: new Date("2026-10-11T00:00:00Z"),
      runCompletedAt: null,
    };
    const before = structuredClone(row);
    const db: DataMigrationDatabase = {
      async query(sql) {
        queries.push(sql);
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
        if (sql.includes("to_regclass")) return { rows: [{ exists: true }] };
        if (sql.includes('FROM "data_migrations"')) return { rows: [row] };
        if (sql.includes("pg_advisory_unlock")) return { rows: [] };
        throw new Error(`Unexpected finished-ledger SQL: ${sql}`);
      },
    };
    const attempt = runActiveDataMigrations(db, [{ ...entry, run, finalize }], {
      batchSize: 10,
      log: () => undefined,
    });
    if (checksum === originalChecksum) await attempt;
    else await expect(attempt).rejects.toThrow("checksum mismatch");
    expect(run).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
    expect(row).toEqual(before);
    expect(queries.some((sql) => /\b(?:INSERT|UPDATE|DELETE|BEGIN)\b/.test(sql))).toBe(false);
  },
);
