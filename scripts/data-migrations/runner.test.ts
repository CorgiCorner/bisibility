import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { DataMigrationDatabase } from "./types";
import {
  computeDataMigrationChecksum,
  resolveDataMigrationRegistry,
  runBlockingDataMigrations,
  validateDataMigrationRegistry,
} from "./runner";
import type { DataMigrationDefinition, ResolvedDataMigration } from "./types";

type LedgerRow = {
  attempts: number;
  checksum: string;
  error: string | null;
  failedAt: Date | null;
  finishedAt: Date | null;
  id: string;
  startedAt: Date;
};

class FakeDatabase implements DataMigrationDatabase {
  ledger = new Map<string, LedgerRow>();
  ledgerTable = true;
  lockDefault = true;
  lockResults: Array<boolean | Error> = [];
  queries: string[] = [];

  async query(sql: string, values: readonly unknown[] = []) {
    this.queries.push(sql);
    if (sql.includes("pg_try_advisory_lock")) {
      const lock = this.lockResults.shift() ?? this.lockDefault;
      if (lock instanceof Error) throw lock;
      return result([{ locked: lock }]);
    }
    if (sql.includes("pg_advisory_unlock")) return result([{ unlocked: true }]);
    if (sql.includes("to_regclass('data_migrations')")) {
      return result([{ exists: this.ledgerTable }]);
    }
    if (sql.includes('FROM "data_migrations"') && sql.includes('SELECT "id"')) {
      const ids = (values[0] ?? []) as string[];
      return result(ids.flatMap((id) => (this.ledger.has(id) ? [this.ledger.get(id)!] : [])));
    }
    if (sql.includes('INSERT INTO "data_migrations"')) {
      const id = String(values[0]);
      const checksum = String(values[1]);
      const previous = this.ledger.get(id);
      const row: LedgerRow = {
        attempts: (previous?.attempts ?? 0) + 1,
        checksum,
        error: null,
        failedAt: null,
        finishedAt: null,
        id,
        startedAt: new Date(),
      };
      this.ledger.set(id, row);
      return result([{ attempts: row.attempts }]);
    }
    if (sql.includes('SET "finishedAt" = NOW()')) {
      const row = this.ledger.get(String(values[0]));
      if (!row || row.checksum !== values[1]) return result([]);
      row.finishedAt = new Date();
      row.failedAt = null;
      row.error = null;
      return result([{ id: row.id }]);
    }
    if (sql.includes('SET "failedAt" = NOW()')) {
      const row = this.ledger.get(String(values[0]));
      if (row && row.checksum === values[1]) {
        row.failedAt = new Date();
        row.error = String(values[2]);
      }
      return result([]);
    }
    throw new Error(`Unexpected query: ${sql}`);
  }
}

function result(rows: Array<Record<string, unknown>>) {
  return Promise.resolve({ rowCount: rows.length, rows });
}

function migration(
  run = vi.fn().mockResolvedValue(undefined),
  overrides: Partial<ResolvedDataMigration> = {},
): ResolvedDataMigration {
  const id = "20260728060000_example";
  return {
    blocking: true,
    blocksSchemaMigration: "20260728063000_contract",
    checksum: "a".repeat(64),
    checksumInputs: [],
    contractState: "pending",
    id,
    requiresSchemaThrough: "20260728050000_prerequisite",
    run,
    sourceUrl: new URL(`file:///tmp/${id}.ts`),
    ...overrides,
  };
}

async function runEntry(db: FakeDatabase, entry: ResolvedDataMigration) {
  await runBlockingDataMigrations(db, [entry], {
    batchSize: 10,
    log: vi.fn(),
  });
}

describe("blocking data migration runner", () => {
  it("skips finished migrations without invoking their implementation or public table scans", async () => {
    const db = new FakeDatabase();
    const afterFinish = vi.fn().mockResolvedValue(undefined);
    const entry = migration(vi.fn(), { afterFinish });
    db.ledger.set(entry.id, {
      attempts: 1,
      checksum: entry.checksum,
      error: null,
      failedAt: null,
      finishedAt: new Date(),
      id: entry.id,
      startedAt: new Date(),
    });

    await runEntry(db, entry);

    expect(entry.run).not.toHaveBeenCalled();
    expect(afterFinish).toHaveBeenCalledWith({
      db,
      log: expect.any(Function),
    });
    expect(db.queries.join("\n")).not.toContain("public_id_migrations");
    expect(db.queries.join("\n")).not.toContain('"projects"');
  });

  it("records a failed attempt and resumes it on the next run", async () => {
    const db = new FakeDatabase();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("interrupted"))
      .mockResolvedValueOnce(undefined);
    const entry = migration(run);

    await expect(runEntry(db, entry)).rejects.toThrow("interrupted");
    expect(run).toHaveBeenCalledTimes(1);
    expect(db.ledger.get(entry.id)).toMatchObject({
      attempts: 1,
      error: expect.stringContaining("interrupted"),
      finishedAt: null,
    });
    expect(db.ledger.get(entry.id)?.failedAt).toBeInstanceOf(Date);

    await runEntry(db, entry);
    expect(db.ledger.get(entry.id)).toMatchObject({
      attempts: 2,
      error: null,
      failedAt: null,
    });
    expect(db.ledger.get(entry.id)?.finishedAt).toBeInstanceOf(Date);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("retries post-finish settlement without rerunning completed migration work", async () => {
    const db = new FakeDatabase();
    const run = vi.fn().mockResolvedValue(undefined);
    const afterFinish = vi
      .fn()
      .mockRejectedValueOnce(new Error("gate release interrupted"))
      .mockResolvedValueOnce(undefined);
    const entry = migration(run, { afterFinish });

    await expect(runEntry(db, entry)).rejects.toThrow("gate release interrupted");
    expect(db.ledger.get(entry.id)?.finishedAt).toBeInstanceOf(Date);
    expect(run).toHaveBeenCalledTimes(1);

    await runEntry(db, entry);
    expect(run).toHaveBeenCalledTimes(1);
    expect(afterFinish).toHaveBeenCalledTimes(2);
  });

  it("fails closed on a finished checksum mismatch", async () => {
    const db = new FakeDatabase();
    const entry = migration();
    db.ledger.set(entry.id, {
      attempts: 1,
      checksum: "b".repeat(64),
      error: null,
      failedAt: null,
      finishedAt: new Date(),
      id: entry.id,
      startedAt: new Date(),
    });

    await expect(runEntry(db, entry)).rejects.toThrow("checksum mismatch");
    expect(entry.run).not.toHaveBeenCalled();
  });

  it("fails with the canonical recovery command when the schema ledger is missing", async () => {
    const db = new FakeDatabase();
    db.ledgerTable = false;
    const entry = migration();

    await expect(runEntry(db, entry)).rejects.toThrow("npm run db:migrate");
    expect(entry.run).not.toHaveBeenCalled();
  });

  it("leaves nonblocking entries for a future background executor", async () => {
    const db = new FakeDatabase();
    const entry = migration(vi.fn(), { blocking: false });

    await runEntry(db, entry);

    expect(entry.run).not.toHaveBeenCalled();
    expect(db.ledger).toHaveLength(0);
  });

  it("waits for a lock holder, then reads the ledger and skips finished work", async () => {
    const db = new FakeDatabase();
    const entry = migration();
    db.lockResults = [false, true];
    db.ledger.set(entry.id, {
      attempts: 1,
      checksum: entry.checksum,
      error: null,
      failedAt: null,
      finishedAt: new Date(),
      id: entry.id,
      startedAt: new Date(),
    });
    let now = 0;
    const sleep = vi.fn(async (milliseconds: number) => {
      now += milliseconds;
    });

    await runBlockingDataMigrations(db, [entry], {
      batchSize: 10,
      lockTimeoutMs: 1_000,
      log: vi.fn(),
      now: () => now,
      sleep,
    });

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(entry.run).not.toHaveBeenCalled();
  });

  it("times out deterministically while only lock contention is retried", async () => {
    const db = new FakeDatabase();
    db.lockDefault = false;
    const entry = migration();
    let now = 0;
    const sleep = vi.fn(async (milliseconds: number) => {
      now += milliseconds;
    });

    await expect(
      runBlockingDataMigrations(db, [entry], {
        batchSize: 10,
        lockTimeoutMs: 500,
        now: () => now,
        sleep,
      }),
    ).rejects.toThrow("consciously redeploy on Railway");
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(entry.run).not.toHaveBeenCalled();
  });

  it("does not retry database errors while acquiring the lock", async () => {
    const db = new FakeDatabase();
    db.lockResults = [new Error("database unavailable"), true];
    const entry = migration();
    const sleep = vi.fn();

    await expect(
      runBlockingDataMigrations(db, [entry], {
        batchSize: 10,
        lockTimeoutMs: 1_000,
        sleep,
      }),
    ).rejects.toThrow("database unavailable");
    expect(sleep).not.toHaveBeenCalled();
    expect(
      db.queries.filter((query) => query.includes("pg_try_advisory_lock")),
    ).toHaveLength(1);
    expect(entry.run).not.toHaveBeenCalled();
  });

  it("validates explicit registry order and source filenames", () => {
    const first = migration();
    const duplicate = migration();
    expect(() => validateDataMigrationRegistry([first, duplicate])).toThrow("Duplicate");
    expect(() =>
      validateDataMigrationRegistry([
        migration(vi.fn(), {
          id: "not_timestamped",
          sourceUrl: new URL("file:///tmp/not_timestamped.ts"),
        }),
      ]),
    ).toThrow("Invalid data migration ID");
    expect(() =>
      validateDataMigrationRegistry([
        migration(vi.fn(), {
          sourceUrl: new URL("file:///tmp/wrong.ts"),
        }),
      ]),
    ).toThrow("filename");
    expect(() =>
      validateDataMigrationRegistry([
        migration(vi.fn(), {
          afterFinish: vi.fn(),
        }),
      ]),
    ).toThrow("requires a write gate phase");
  });

  it("includes declared implementation dependencies in the deterministic checksum", async () => {
    const directory = await mkdtemp(join(tmpdir(), "data-migration-checksum-"));
    const id = "20260728060000_dependency_check";
    const source = join(directory, `${id}.ts`);
    const dependency = join(directory, "dependency.ts");
    try {
      await writeFile(source, "export async function run() {};\n");
      await writeFile(dependency, "export const behavior = 1;\n");
      const definition: DataMigrationDefinition = {
        blocking: true,
        blocksSchemaMigration: "20260728063000_contract",
        checksum: "0".repeat(64),
        checksumInputs: [
          { label: `${id}.ts`, url: pathToFileURL(source) },
          { label: "dependency.ts", url: pathToFileURL(dependency) },
        ],
        contractState: "pending",
        id,
        requiresSchemaThrough: "20260728050000_prerequisite",
        run: vi.fn(),
        sourceUrl: pathToFileURL(source),
      };
      const before = await computeDataMigrationChecksum(definition);
      definition.checksum = before;
      await expect(resolveDataMigrationRegistry([definition])).resolves.toHaveLength(1);
      await writeFile(dependency, "export const behavior = 2;\n");
      const after = await computeDataMigrationChecksum(definition);

      expect(after).not.toBe(before);
      await expect(resolveDataMigrationRegistry([definition])).rejects.toThrow(
        "checksum mismatch",
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("includes the migration module's run binding in the deterministic checksum", async () => {
    const directory = await mkdtemp(join(tmpdir(), "data-migration-binding-"));
    const id = "20260728060000_binding_check";
    const source = join(directory, `${id}.ts`);
    try {
      await writeFile(source, "export const definition = { run: prepare };\n");
      const definition = migration(vi.fn(), {
        checksumInputs: [{ label: `${id}.ts`, url: pathToFileURL(source) }],
        id,
        sourceUrl: pathToFileURL(source),
      });
      const before = await computeDataMigrationChecksum(definition);
      await writeFile(source, "export const definition = { run: replacement };\n");

      await expect(computeDataMigrationChecksum(definition)).resolves.not.toBe(before);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
