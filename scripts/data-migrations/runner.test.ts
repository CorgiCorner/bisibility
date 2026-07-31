import { describe, expect, it, vi } from "vitest";
import { runActiveDataMigrations } from "./runner";
import type { DataMigrationDatabase, ResolvedDataMigration } from "./types";

type LedgerRow = {
  attempts: number;
  checksum: string;
  error: string | null;
  failedAt: Date | null;
  finalizationAttempts: number;
  finalizationError: string | null;
  finalizationFailedAt: Date | null;
  finishedAt: Date | null;
  id: string;
  runCompletedAt: Date | null;
  startedAt: Date;
};

function result(rows: Array<Record<string, unknown>>) {
  return Promise.resolve({ rows });
}

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
      return this.insert(values);
    }
    if (sql.includes('SET "runCompletedAt" = NOW()')) {
      return this.completeRun(values);
    }
    if (sql.includes('SET "finalizationAttempts" = "finalizationAttempts" + 1')) {
      return this.startFinalization(values);
    }
    if (sql.includes('SET "finalizationFailedAt" = NOW()')) {
      const row = this.match(values);
      if (row) {
        row.finalizationFailedAt = new Date();
        row.finalizationError = String(values[2]);
      }
      return result([]);
    }
    if (sql.includes('SET "finishedAt" = NOW()')) {
      const row = this.match(values);
      if (!row?.runCompletedAt || row.finishedAt) return result([]);
      row.finishedAt = new Date();
      row.failedAt = null;
      row.error = null;
      row.finalizationFailedAt = null;
      row.finalizationError = null;
      return result([{ id: row.id }]);
    }
    if (sql.includes('SET "failedAt" = NOW()')) {
      const row = this.match(values);
      if (row) {
        row.failedAt = new Date();
        row.error = String(values[2]);
      }
      return result([]);
    }
    throw new Error(`Unexpected query: ${sql}`);
  }

  private match(values: readonly unknown[]) {
    const row = this.ledger.get(String(values[0]));
    return row?.checksum === values[1] ? row : undefined;
  }

  private insert(values: readonly unknown[]) {
    const id = String(values[0]);
    const checksum = String(values[1]);
    const previous = this.ledger.get(id);
    if (previous) return result([]);
    const row: LedgerRow = {
      attempts: 1,
      checksum,
      error: null,
      failedAt: null,
      finalizationAttempts: 0,
      finalizationError: null,
      finalizationFailedAt: null,
      finishedAt: null,
      id,
      runCompletedAt: null,
      startedAt: new Date(),
    };
    this.ledger.set(id, row);
    return result([{ attempts: row.attempts }]);
  }

  private completeRun(values: readonly unknown[]) {
    const row = this.match(values);
    if (!row || row.runCompletedAt || row.finishedAt) return result([]);
    row.runCompletedAt = new Date();
    row.failedAt = null;
    row.error = null;
    return result([{ id: row.id }]);
  }

  private startFinalization(values: readonly unknown[]) {
    const row = this.match(values);
    if (!row?.runCompletedAt || row.finishedAt) return result([]);
    row.finalizationAttempts += 1;
    row.finalizationFailedAt = null;
    row.finalizationError = null;
    return result([{ finalizationAttempts: row.finalizationAttempts }]);
  }
}

function migration(
  run = vi.fn().mockResolvedValue(undefined),
  overrides: Partial<ResolvedDataMigration> = {},
): ResolvedDataMigration {
  const id = "20260728060000_example";
  return {
    checksum: "a".repeat(64),
    checksumInputs: [],
    contractMigrationId: "20260728063000_contract",
    execution: "deploy-blocking",
    id,
    lifecycle: "active",
    prerequisiteSchemaMigrationId: "20260728050000_prerequisite",
    run,
    sourceUrl: new URL(`file:///tmp/${id}.ts`),
    ...overrides,
  };
}

function ledgerRow(entry: ResolvedDataMigration, overrides: Partial<LedgerRow> = {}) {
  return {
    attempts: 1,
    checksum: entry.checksum,
    error: null,
    failedAt: null,
    finalizationAttempts: 0,
    finalizationError: null,
    finalizationFailedAt: null,
    finishedAt: null,
    id: entry.id,
    runCompletedAt: null,
    startedAt: new Date(),
    ...overrides,
  };
}

async function runEntry(db: FakeDatabase, entry: ResolvedDataMigration) {
  await runActiveDataMigrations(db, [entry], {
    batchSize: 10,
    log: vi.fn(),
  });
}

describe("active data migration runner", () => {
  it("completes run and finalization once, then skips the finished migration", async () => {
    const db = new FakeDatabase();
    const run = vi.fn().mockResolvedValue(undefined);
    const finalize = vi.fn().mockResolvedValue(undefined);
    const entry = migration(run, { finalize });

    await runEntry(db, entry);
    await runEntry(db, entry);

    expect(run).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(db.ledger.get(entry.id)).toMatchObject({
      attempts: 1,
      finalizationAttempts: 1,
    });
    expect(db.ledger.get(entry.id)?.runCompletedAt).toBeInstanceOf(Date);
    expect(db.ledger.get(entry.id)?.finishedAt).toBeInstanceOf(Date);
  });

  it("keeps historical finished rows final without invoking run or finalize", async () => {
    const db = new FakeDatabase();
    const finalize = vi.fn().mockResolvedValue(undefined);
    const entry = migration(vi.fn(), { finalize });
    db.ledger.set(
      entry.id,
      ledgerRow(entry, { finishedAt: new Date(), runCompletedAt: null }),
    );

    await runEntry(db, entry);

    expect(entry.run).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("records a failed run and never invokes it again", async () => {
    const db = new FakeDatabase();
    const run = vi.fn().mockRejectedValueOnce(new Error("interrupted"));
    const entry = migration(run);

    await expect(runEntry(db, entry)).rejects.toThrow("interrupted");
    expect(db.ledger.get(entry.id)).toMatchObject({
      attempts: 1,
      error: expect.stringContaining("interrupted"),
      finishedAt: null,
      runCompletedAt: null,
    });

    await expect(runEntry(db, entry)).rejects.toThrow("must not be rerun");
    expect(run).toHaveBeenCalledTimes(1);
    expect(db.ledger.get(entry.id)).toMatchObject({
      attempts: 1,
      error: expect.stringContaining("interrupted"),
      finishedAt: null,
      runCompletedAt: null,
    });
  });

  it("persists finalization failure and retries only finalization", async () => {
    const db = new FakeDatabase();
    const run = vi.fn().mockResolvedValue(undefined);
    const finalize = vi
      .fn()
      .mockRejectedValueOnce(new Error("finalization interrupted"))
      .mockResolvedValueOnce(undefined);
    const entry = migration(run, { finalize });

    await expect(runEntry(db, entry)).rejects.toThrow("finalization interrupted");
    expect(db.ledger.get(entry.id)).toMatchObject({
      attempts: 1,
      finalizationAttempts: 1,
      finalizationError: expect.stringContaining("finalization interrupted"),
      finishedAt: null,
    });
    expect(db.ledger.get(entry.id)?.runCompletedAt).toBeInstanceOf(Date);
    expect(db.ledger.get(entry.id)?.finalizationFailedAt).toBeInstanceOf(Date);

    await runEntry(db, entry);

    expect(run).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(2);
    expect(db.ledger.get(entry.id)).toMatchObject({
      attempts: 1,
      finalizationAttempts: 2,
      finalizationError: null,
      finalizationFailedAt: null,
    });
    expect(db.ledger.get(entry.id)?.finishedAt).toBeInstanceOf(Date);
  });

  it("fails closed on a stored checksum mismatch", async () => {
    const db = new FakeDatabase();
    const entry = migration();
    db.ledger.set(
      entry.id,
      ledgerRow(entry, {
        checksum: "b".repeat(64),
        finishedAt: new Date(),
        runCompletedAt: new Date(),
      }),
    );

    await expect(runEntry(db, entry)).rejects.toThrow("checksum mismatch");
    expect(entry.run).not.toHaveBeenCalled();
  });

  it("uses the recovery command when the ledger is missing", async () => {
    const db = new FakeDatabase();
    db.ledgerTable = false;
    const entry = migration();

    await expect(runEntry(db, entry)).rejects.toThrow("npm run db:migrate");
    expect(entry.run).not.toHaveBeenCalled();
  });

  it("waits for the lock holder before reading finished state", async () => {
    const db = new FakeDatabase();
    const entry = migration();
    db.lockResults = [false, true];
    db.ledger.set(
      entry.id,
      ledgerRow(entry, { finishedAt: new Date(), runCompletedAt: new Date() }),
    );
    let now = 0;
    const sleep = vi.fn(async (milliseconds: number) => {
      now += milliseconds;
    });

    await runActiveDataMigrations(db, [entry], {
      batchSize: 10,
      lockTimeoutMs: 1_000,
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
      runActiveDataMigrations(db, [entry], {
        batchSize: 10,
        lockTimeoutMs: 500,
        now: () => now,
        sleep,
      }),
    ).rejects.toThrow("rerun npm run db:migrate");
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(entry.run).not.toHaveBeenCalled();
  });

  it("does not retry database errors while acquiring the lock", async () => {
    const db = new FakeDatabase();
    db.lockResults = [new Error("database unavailable"), true];
    const entry = migration();
    const sleep = vi.fn();

    await expect(
      runActiveDataMigrations(db, [entry], {
        batchSize: 10,
        lockTimeoutMs: 1_000,
        sleep,
      }),
    ).rejects.toThrow("database unavailable");
    expect(sleep).not.toHaveBeenCalled();
    expect(entry.run).not.toHaveBeenCalled();
  });
});
