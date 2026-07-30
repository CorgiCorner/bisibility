import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import { describe, expect, it, vi } from "vitest";
import {
  highVolumePublicIdTables,
  publicIdContractEntities,
  publicIdFormatPattern,
} from "./definition";
import { assertPublicIdContractPreconditions, preparePublicIdContract } from "./prepare";

function unquoteIdentifier(value: unknown) {
  return String(value).replaceAll('"', "");
}

function createPreparedDatabase(options?: {
  createIndexError?: Error;
  incompleteLedgerEntries?: number;
  ledgerMismatches?: number;
  lockTimeout?: string;
  postCutoverRows?: boolean;
}) {
  const existingIndexes = new Set<string>(
    highVolumePublicIdTables
      .filter((table) => table !== "rank_checks")
      .map((table) => `${table}_publicId_key`),
  );
  const prefixByTable = new Map<string, string>(
    publicIdContractEntities.map((entity) => [entity.table, entity.prefix]),
  );
  const query = vi.fn<PublicIdMigrationDatabase["query"]>(async (sql, values = []) => {
    if (sql === "SHOW lock_timeout") {
      return { rows: [{ lock_timeout: options?.lockTimeout ?? "0" }] };
    }
    if (sql.includes("set_config('lock_timeout'")) {
      return { rows: [{}] };
    }
    if (sql.includes('COUNT(*) FILTER (WHERE "publicId" IS NULL)')) {
      return {
        rows: [
          {
            invalid: 0,
            ledgerMigrated: 0,
            missing: 0,
            strict: options?.postCutoverRows ? 1 : 0,
            total: options?.postCutoverRows ? 1 : 0,
          },
        ],
      };
    }
    if (sql.includes('WHERE "migratedAt" IS NULL')) {
      return { rows: [{ count: options?.incompleteLedgerEntries ?? 0 }] };
    }
    if (sql.includes('"newPublicId" IS DISTINCT FROM "row"."publicId"')) {
      return { rows: [{ count: options?.ledgerMismatches ?? 0 }] };
    }
    if (sql.includes('COUNT(*)::int AS "count"')) {
      return { rows: [{ count: 0 }] };
    }
    if (sql.includes("FROM pg_catalog.pg_index")) {
      const index = unquoteIdentifier(values[0]);
      if (!existingIndexes.has(index)) return { rows: [] };
      const table = index.replace(/_publicId_key$/, "");
      return {
        rows: [
          {
            accessMethod: "btree",
            attributeCount: 1,
            expressionFree: true,
            keyAttributeCount: 1,
            keyColumns: ["publicId"],
            predicateFree: true,
            table,
            unique: true,
            valid: true,
          },
        ],
      };
    }
    if (sql.includes("CREATE UNIQUE INDEX CONCURRENTLY")) {
      if (options?.createIndexError) throw options.createIndexError;
      const match = sql.match(/CREATE UNIQUE INDEX CONCURRENTLY "([^"]+)"/);
      if (!match) throw new Error("Test could not identify the created index.");
      existingIndexes.add(match[1]);
      return { rows: [] };
    }
    if (sql.includes("FROM pg_catalog.pg_constraint")) {
      const name = String(values[0]);
      const table = unquoteIdentifier(values[1]);
      const prefix = prefixByTable.get(table);
      if (!prefix) throw new Error(`Unexpected contract table in test: ${table}`);
      const definition = name.endsWith("_format")
        ? `CHECK (("publicId" ~ '${publicIdFormatPattern(prefix)}'::text))`
        : 'CHECK (("publicId" IS NOT NULL))';
      return {
        rows: [
          {
            definition,
            table,
            type: "c",
            validated: true,
          },
        ],
      };
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
  });
  return { db: { query } satisfies PublicIdMigrationDatabase, query };
}

describe("assertPublicIdContractPreconditions", () => {
  it("allows strict IDs created after the historical migration ledger completed", async () => {
    const { db } = createPreparedDatabase({ postCutoverRows: true });

    await expect(assertPublicIdContractPreconditions(db)).resolves.toHaveLength(23);
  });

  it("rejects an unfinished historical migration ledger entry", async () => {
    const { db } = createPreparedDatabase({ incompleteLedgerEntries: 1 });

    await expect(assertPublicIdContractPreconditions(db)).rejects.toThrow(
      "Public ID ledger has 1 incomplete entries.",
    );
  });

  it("rejects a completed ledger entry that disagrees with its live row", async () => {
    const { db } = createPreparedDatabase({ ledgerMismatches: 1 });

    await expect(assertPublicIdContractPreconditions(db)).rejects.toThrow(
      "Public ID ledger mismatch for user: 1 rows.",
    );
  });
});

describe("preparePublicIdContract", () => {
  it("bounds DDL lock waits without wrapping concurrent indexes in a transaction", async () => {
    const { db, query } = createPreparedDatabase({ lockTimeout: "250ms" });

    await expect(preparePublicIdContract(db)).resolves.toHaveLength(23);

    expect(query.mock.calls[0]).toEqual(["SHOW lock_timeout"]);
    expect(query.mock.calls[1]).toEqual([`SELECT set_config('lock_timeout', $1, false)`, ["5s"]]);
    expect(query.mock.calls.at(-1)).toEqual([
      `SELECT set_config('lock_timeout', $1, false)`,
      ["250ms"],
    ]);
    expect(query.mock.calls.some(([sql]) => sql.includes("CREATE UNIQUE INDEX CONCURRENTLY"))).toBe(
      true,
    );
    expect(query.mock.calls.some(([sql]) => /^\s*(BEGIN|COMMIT)\b/.test(sql))).toBe(false);
  });

  it("restores the previous lock timeout when concurrent index creation fails", async () => {
    const createIndexError = new Error("index lock timeout");
    const { db, query } = createPreparedDatabase({
      createIndexError,
      lockTimeout: "1min",
    });

    await expect(preparePublicIdContract(db)).rejects.toBe(createIndexError);

    expect(query.mock.calls.at(-1)).toEqual([
      `SELECT set_config('lock_timeout', $1, false)`,
      ["1min"],
    ]);
  });
});
