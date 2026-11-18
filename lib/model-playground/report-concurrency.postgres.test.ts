import { expect, test, vi } from "vitest";
import { result } from "./contract-fixtures.test-support";
import { finishModelColumn } from "./execution-storage";
import { readRetainedModelRun } from "./history";
import { withoutFixtureTrigger } from "./launch-database.test-support";
import { reportProductionDatabase } from "./production.postgres.test-support";
import { saveModelPlaygroundReport } from "./report";
import { seedProductionReport } from "./report-production.test-support";
import { recoverModelPlaygroundReports } from "./report-recovery";
import type { ModelPlaygroundDatabase } from "./store-db";

vi.mock("./database", () => ({
  modelPlaygroundDatabase: {
    $transaction: () => {
      throw new Error("Only the supplied fixture database is allowed");
    },
  },
}));

test.skipIf(!process.env.AI_TRACKING_TEST_DATABASE_URL)(
  "real overlapping completions serialize on the run lock and retain both answers",
  async () => {
    const fixture = await reportProductionDatabase();
    const db = fixture.client;
    const database: ModelPlaygroundDatabase = {
      $transaction: (work) => db.$transaction((tx) => work(tx), { timeout: 15000 }),
    };
    try {
      const { project, snapshot, store, run, identities } = await seedProductionReport(
        db,
        database,
      );
      let unlock!: () => void;
      let locked!: () => void;
      const held = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const release = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const blocker = db.$transaction(
        async (tx) => {
          await tx.$queryRawUnsafe(
            `SELECT id FROM model_playground_runs WHERE id=$1 FOR UPDATE`,
            run.id,
          );
          locked();
          await release;
        },
        { timeout: 15000 },
      );
      await held;
      let finished = 0;
      // This is the production inline transaction adapter, on separate pooled connections.
      const pending = identities.map((identity, index) =>
        finishModelColumn(db, identity, {
          ...result(),
          column: snapshot.input.columns[index],
          answer: `Paid answer ${index}`,
        }).then((terminal) => {
          finished++;
          return terminal;
        }),
      );
      let terminals: boolean[];
      try {
        await vi.waitFor(
          async () => {
            const rows = await db.$queryRawUnsafe<{ count: number; connections: number }[]>(
              `SELECT COUNT(*)::int AS count,COUNT(DISTINCT pid)::int AS connections FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%model_playground_runs%FOR UPDATE%'`,
            );
            expect(rows[0].count).toBeGreaterThanOrEqual(2);
            expect(rows[0].connections).toBeGreaterThanOrEqual(2);
          },
          { timeout: 5000 },
        );
        expect(finished).toBe(0);
      } finally {
        unlock();
        await blocker;
        terminals = await Promise.all(pending);
      }
      expect(terminals.sort()).toEqual([false, true]);
      expect((await store.read(project.id, run.id)).columns.map((c) => c.result?.answer)).toEqual([
        "Paid answer 0",
        "Paid answer 1",
      ]);
      expect(
        await finishModelColumn(db, identities[0], {
          ...result(),
          column: snapshot.input.columns[0],
        }),
      ).toBe(false);
      const saved = await Promise.all([
        saveModelPlaygroundReport(database, { projectId: project.id, runId: run.id }, []),
        saveModelPlaygroundReport(database, { projectId: project.id, runId: run.id }, []),
      ]);
      expect(saved.map((s) => s.ok && s.alreadySaved).sort()).toEqual([false, true]);
      expect(await db.agentReport.count({ where: { projectId: project.id } })).toBe(1);
    } finally {
      await fixture.dispose();
    }
  },
  120000,
);

test.skipIf(!process.env.AI_TRACKING_TEST_DATABASE_URL)(
  "production recovery uses real text ids, timestamp precision and a cursor in a non-public schema",
  async () => {
    const fixture = await reportProductionDatabase();
    const db = fixture.client;
    const database: ModelPlaygroundDatabase = {
      $transaction: (work) =>
        db.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Europe/Warsaw'");
            return work(tx);
          },
          { timeout: 15000 },
        ),
    };
    try {
      const first = await seedProductionReport(db, database);
      const second = await seedProductionReport(db, database);
      const [types] = await db.$queryRawUnsafe<
        { schema: string; idType: string; createdAtType: string; attemptType: string }[]
      >(`
      SELECT current_schema() AS schema, pg_typeof(r.id)::text AS "idType",
      format_type(a.atttypid,a.atttypmod) AS "createdAtType",
      (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='model_playground_payment_attempts'::regclass AND attname='dispatched_at') AS "attemptType"
      FROM model_playground_runs r JOIN pg_attribute a ON a.attrelid='model_playground_runs'::regclass AND a.attname='createdAt' LIMIT 1`);
      expect(types).toMatchObject({
        schema: expect.stringMatching(/^mp_report_/),
        idType: "text",
        createdAtType: "timestamp(3) without time zone",
        attemptType: "timestamp with time zone",
      });
      // Expired unknowns use production timestamptz attempts alongside timestamp(3) columns.
      await withoutFixtureTrigger(
        { exec: (sql) => db.$executeRawUnsafe(sql) },
        "model_playground_columns",
        "model_playground_column_integrity",
        async () => {
          await db.$executeRawUnsafe(
            `UPDATE model_playground_columns SET "dispatchStartedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '151 seconds',"leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '1 second' WHERE "runId"=$1`,
            first.run.id,
          );
        },
      );
      for (const identity of first.identities)
        expect(await first.store.expireDispatched(identity)).toBe(true);
      const attemptId = crypto.randomUUID();
      const [storedDispatch] = await db.$queryRaw<{ dispatchedAt: Date }[]>`
        SELECT clock_timestamp() - INTERVAL '140 seconds' AS "dispatchedAt"`;
      const dispatchedAt = storedDispatch.dispatchedAt;
      await db.modelPlaygroundPaymentQuote.create({
        data: {
          id: first.run.previewId,
          projectId: first.project.id,
          actorId: first.owner.id,
          principal: first.owner.id,
          contentHash: "f".repeat(64),
          snapshot: {},
          createdAt: dispatchedAt,
        },
      });
      await db.meteringOperation.create({
        data: {
          operation_pk: attemptId,
          namespace: "fixture",
          principal: first.owner.id,
          operation_id: attemptId,
          state: "dispatch_intended",
          version: 1,
          semantic_hash: "fixture",
          budget_epochs: [],
          reservation_expires_at: new Date(),
          created_at: dispatchedAt,
          updated_at: dispatchedAt,
          input: {},
          warnings: [],
        },
      });
      await db.modelPlaygroundPaymentAttempt.create({
        data: {
          id: attemptId,
          quoteId: first.run.previewId,
          columnId: first.identities[0].columnId,
          namespace: "fixture",
          principal: first.owner.id,
          binding: {},
          dispatchedAt,
        },
      });
      const waiting = await readRetainedModelRun(database, {
        projectId: first.project.id,
        runId: first.run.id,
      });
      expect(waiting).toMatchObject({ ok: true, terminal: false, readyAt: expect.any(String) });
      if (!waiting.ok || !waiting.readyAt) throw new Error("Expected timed readiness");
      expect(Math.abs(Date.parse(waiting.readyAt) - (+dispatchedAt + 150000))).toBeLessThanOrEqual(
        1,
      );
      const [expiredDispatch] = await db.$queryRaw<{ dispatchedAt: Date }[]>`
        SELECT clock_timestamp() - INTERVAL '151 seconds' AS "dispatchedAt"`;
      await db.modelPlaygroundPaymentAttempt.update({
        where: { id: attemptId },
        data: { dispatchedAt: expiredDispatch.dispatchedAt },
      });
      expect(
        await readRetainedModelRun(database, { projectId: first.project.id, runId: first.run.id }),
      ).toMatchObject({ ok: true, terminal: true, readyAt: null });
      for (const [i, identity] of second.identities.entries())
        await finishModelColumn(db, identity, {
          ...result(),
          column: second.snapshot.input.columns[i],
        });
      for (const seeded of [first, second])
        expect(
          (
            await saveModelPlaygroundReport(
              database,
              { projectId: seeded.project.id, runId: seeded.run.id },
              [],
            )
          ).ok,
        ).toBe(true);
      await db.$executeRawUnsafe(
        `UPDATE model_playground_runs SET "reportState"='saved_stale',"reportFailure"='storage',"reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE "reportState"='saved'`,
      );
      await db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS reject_report ON agent_reports; DROP TRIGGER IF EXISTS reject_report ON model_playground_runs; DROP FUNCTION IF EXISTS reject_report();
         CREATE FUNCTION reject_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture refresh failure'; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER reject_report BEFORE UPDATE ON model_playground_runs FOR EACH ROW WHEN (NEW."reportState"='saved') EXECUTE FUNCTION reject_report()`,
      );
      const failed = await recoverModelPlaygroundReports(database, { limit: 1 });
      expect(failed).toMatchObject({ ok: true, attempted: 1, saved: 0, failed: 1 });
      if (!failed.ok || !failed.next) throw new Error("Expected failure cursor");
      const [exact] = await db.$queryRawUnsafe<{ value: string }[]>(
        `SELECT to_char("createdAt",'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS value FROM model_playground_runs WHERE id=$1`,
        failed.next.id,
      );
      expect(failed.next.createdAt).toBe(exact.value);
      await db.$executeRawUnsafe(`DROP TRIGGER reject_report ON model_playground_runs`);
      expect(
        await recoverModelPlaygroundReports(database, { limit: 1, after: failed.next }),
      ).toMatchObject({ ok: true, attempted: 1, saved: 1 });
      expect(await recoverModelPlaygroundReports(database)).toMatchObject({
        ok: true,
        attempted: 0,
      });
      await db.$executeRawUnsafe(
        `UPDATE model_playground_runs SET "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
        failed.next.id,
      );
      expect(await recoverModelPlaygroundReports(database)).toMatchObject({
        ok: true,
        attempted: 1,
        saved: 1,
      });
      expect(await db.agentReport.count()).toBe(2);
      await db.agentReport.deleteMany();
      expect(await recoverModelPlaygroundReports(database)).toMatchObject({
        ok: true,
        attempted: 0,
      });
    } finally {
      await fixture.dispose();
    }
  },
  120000,
);

test.skipIf(!process.env.AI_TRACKING_TEST_DATABASE_URL)(
  "retained payload and readiness share one snapshot while paid completions wait",
  async () => {
    const fixture = await reportProductionDatabase();
    const db = fixture.client;
    const database: ModelPlaygroundDatabase = {
      $transaction: (work) => db.$transaction((tx) => work(tx), { timeout: 15000 }),
    };
    try {
      const seeded = await seedProductionReport(db, database);
      let pause!: () => void, release!: () => void;
      const held = new Promise<void>((resolve) => {
        pause = resolve;
      });
      const unlocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reader: ModelPlaygroundDatabase = {
        $transaction: (work) =>
          database.$transaction((tx) =>
            work({
              $queryRawUnsafe: async <T>(sql: string, ...args: unknown[]) => {
                const rows = await tx.$queryRawUnsafe<T>(sql, ...args);
                if (sql.startsWith("SELECT * FROM model_playground_columns")) {
                  pause();
                  await unlocked;
                }
                return rows;
              },
            }),
          ),
      };
      const reading = readRetainedModelRun(reader, {
        projectId: seeded.project.id,
        runId: seeded.run.id,
      });
      await held;
      const completions = seeded.identities.map((identity, i) =>
        finishModelColumn(db, identity, { ...result(), column: seeded.snapshot.input.columns[i] }),
      );
      let read: Awaited<typeof reading>;
      try {
        await vi.waitFor(
          async () => {
            const [waiters] = await db.$queryRawUnsafe<{ count: number }[]>(
              `SELECT COUNT(DISTINCT pid)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%model_playground_runs%FOR UPDATE%'`,
            );
            expect(waiters.count).toBeGreaterThanOrEqual(2);
          },
          { timeout: 5000 },
        );
      } finally {
        release();
        read = await reading;
        await Promise.all(completions);
      }
      expect(read).toMatchObject({ ok: true, terminal: false });
      if (!read.ok) throw new Error("Expected retained read");
      expect(read.run.columns.every((column) => column.result === null)).toBe(true);
      const latest = await readRetainedModelRun(database, {
        projectId: seeded.project.id,
        runId: seeded.run.id,
      });
      expect(latest).toMatchObject({ ok: true, terminal: true });
      expect(latest.ok && latest.run.columns.every((column) => column.result?.answer)).toBe(true);
    } finally {
      await fixture.dispose();
    }
  },
  120000,
);
