import { expect, test, vi } from "vitest";
import { historyHarness } from "./history.test-support";
import { withoutFixtureTrigger } from "./launch-database.test-support";
import { saveModelPlaygroundReport } from "./report";
import { recoverModelPlaygroundReports } from "./report-recovery";
import * as store from "./store";

const entities = vi.hoisted(() => ({
  fail: false,
  beforeLoad: null as null | (() => Promise<void>),
}));
vi.mock("./report-context", () => ({
  loadModelReportEntities: async () => {
    if (entities.beforeLoad) await entities.beforeLoad();
    if (entities.fail) throw new Error("entity storage");
    return [];
  },
}));
vi.mock("./database", () => ({
  modelPlaygroundDatabase: {
    $transaction: () => {
      throw new Error("Recovery must use its supplied handle");
    },
  },
}));

const h = historyHarness();
const count = async () => (await h.db.query(`SELECT id FROM agent_reports`)).rows.length;

test("expiry stays pending until the observation bound, and the report sweep does not create", async () => {
  const run = await h.launch(false);
  const lease = await h.store.claim({
    projectId: "project-a",
    runId: run.id,
    columnId: run.columns[0].columnId,
    leaseSeconds: 300,
  });
  if (!lease?.leaseToken) throw new Error("Expected lease");
  const identity = {
    projectId: "project-a",
    runId: run.id,
    columnId: lease.columnId,
    leaseToken: lease.leaseToken,
  };
  await h.store.fenceDispatch(identity);
  // Historical timing only; immutable production timestamps are never rewritten.
  await withoutFixtureTrigger(
    h.db,
    "model_playground_columns",
    "model_playground_column_integrity",
    async () => {
      await h.db.query(
        `UPDATE model_playground_columns SET "dispatchStartedAt"=CURRENT_TIMESTAMP-INTERVAL '151 seconds',"leaseExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE "runId"=$1`,
        [run.id],
      );
    },
  );
  expect(await h.store.expireDispatched(identity)).toBe(true);
  await h.db.query(
    `INSERT INTO model_playground_payment_attempts(quote_id,column_id,dispatched_at) VALUES($1,$2,CURRENT_TIMESTAMP)`,
    [run.previewId, lease.columnId],
  );
  expect(
    await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: run.id }, []),
  ).toEqual({ ok: false, reason: "pending" });
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({ ok: true, attempted: 0 });
  expect(await count()).toBe(0);
  await h.db.exec(
    `UPDATE model_playground_payment_attempts SET dispatched_at=CURRENT_TIMESTAMP-INTERVAL '151 seconds'`,
  );
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({ ok: true, attempted: 0 });
  expect(
    (await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: run.id }, [])).ok,
  ).toBe(true);
  const reports = (
    await h.db.query<{ body: { results: unknown[] } }>(`SELECT body FROM agent_reports`)
  ).rows;
  expect(reports[0].body.results).toEqual([
    { column: run.snapshot.input.columns[0], state: "unknown", answer: null },
  ]);
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({ ok: true, attempted: 0 });
  expect(await count()).toBe(1);
});

test("saved_stale storage repair paginates a failing head and retries after backoff", async () => {
  await h.launch(false); // Positive control: a reportless pending run is not in the repair batch.
  const runs = [await h.launch(), await h.launch(), await h.launch()];
  for (const run of runs)
    expect(
      (await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: run.id }, []))
        .ok,
    ).toBe(true);
  await h.db.exec(
    `UPDATE model_playground_runs SET "reportState"='saved_stale',"reportFailure"='storage',"reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE "reportState"='saved'`,
  );
  await h.db.exec(`CREATE FUNCTION reject_report() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
    CREATE TRIGGER reject_report BEFORE UPDATE ON model_playground_runs FOR EACH ROW WHEN (NEW."reportState"='saved') EXECUTE FUNCTION reject_report();`);
  const failed = await recoverModelPlaygroundReports(h.database, { limit: 1 });
  expect(failed).toMatchObject({ ok: true, attempted: 1, saved: 0, failed: 1 });
  if (!failed.ok || !failed.next) throw new Error("Expected cursor past failure");
  expect(await count()).toBe(runs.length);
  await h.db.exec(`DROP TRIGGER reject_report ON model_playground_runs`);
  const later = await recoverModelPlaygroundReports(h.database, { limit: 2, after: failed.next });
  expect(later).toMatchObject({ ok: true, attempted: 2, saved: 2, failed: 0 });
  expect(await count()).toBe(runs.length);
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({ ok: true, attempted: 0 });
  await h.db.exec(
    `UPDATE model_playground_runs SET "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE "reportState"='saved_stale'`,
  );
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
    ok: true,
    attempted: 1,
    saved: 1,
  });
  expect(await count()).toBe(runs.length);
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({ ok: true, attempted: 0 });
});

test.each(["migration_hold", "migrated"])(
  "recovery omits %s projects and does not create when they become active",
  async (mode) => {
    await h.launch();
    await h.db.query(`UPDATE projects SET "writeMode"=$1 WHERE id='project-a'`, [mode]);
    expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
      ok: true,
      attempted: 0,
    });
    expect(await count()).toBe(0);
    await h.db.exec(`UPDATE projects SET "writeMode"='active'`);
    expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
      ok: true,
      attempted: 0,
    });
    expect(await count()).toBe(0);
  },
);

test.each([0, 101, 1.5])(
  "invalid batch %s is a typed refusal before database access",
  async (limit) => {
    const db = { $transaction: vi.fn() };
    expect(await recoverModelPlaygroundReports(db, { limit })).toEqual({
      ok: false,
      reason: "invalid_input",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  },
);

test("discovery failure returns typed storage without dispatching", async () => {
  const db = { $transaction: vi.fn().mockRejectedValue(new Error("storage")) };
  expect(await recoverModelPlaygroundReports(db)).toEqual({ ok: false, reason: "storage" });
  expect(db.$transaction).toHaveBeenCalledOnce();
});

test("deleted reports stay dismissed across save and recovery", async () => {
  const run = await h.launch();
  const identity = { projectId: "project-a", runId: run.id };
  expect((await saveModelPlaygroundReport(h.database, identity, [])).ok).toBe(true);
  expect(await count()).toBe(1);
  await h.db.exec(`DELETE FROM agent_reports`);
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({ ok: true, attempted: 0 });
  expect(await saveModelPlaygroundReport(h.database, identity, [])).toEqual({
    ok: false,
    reason: "dismissed",
  });
  expect(await count()).toBe(0);
  expect((await h.store.read("project-a", run.id)).columns[0].result?.answer).toBeTruthy();
});

test.each(["too_large", "conflict"])(
  "%s is durable and excluded from automatic recovery",
  async (reason) => {
    const run = await h.launch();
    const entities = [
      {
        id: "brand",
        kind: "project" as const,
        label: reason === "conflict" ? null : "Brand",
        domain: null,
        aliases: reason === "too_large" ? Array.from({ length: 20001 }, () => "a") : [],
        excludedNames: [],
      },
    ];
    expect(
      await saveModelPlaygroundReport(
        h.database,
        { projectId: "project-a", runId: run.id },
        entities as never,
      ),
    ).toEqual({ ok: false, reason });
    expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
      ok: true,
      attempted: 0,
    });
    const stored = (
      await h.db.query(
        `SELECT "reportState","reportFailure","reportAttemptedAt" FROM model_playground_runs WHERE id=$1`,
        [run.id],
      )
    ).rows[0];
    expect(stored).toMatchObject({
      reportState: "failed",
      reportFailure: reason,
      reportAttemptedAt: expect.any(Date),
    });
    expect(await count()).toBe(0);
    // Positive control: explicit authorized retry is possible after the source was repaired.
    expect(
      (await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: run.id }, []))
        .ok,
    ).toBe(true);
  },
);

test("a storage failure backs off while its full-precision limit-1 cursor advances", async () => {
  await h.db.exec(`ALTER TABLE model_playground_runs ALTER COLUMN "createdAt" TYPE timestamp(6)`);
  const first = await h.launch();
  const second = await h.launch();
  for (const run of [first, second])
    expect(
      (await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: run.id }, []))
        .ok,
    ).toBe(true);
  await h.db.exec(
    `UPDATE model_playground_runs SET "reportState"='saved_stale',"reportFailure"='storage',"reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds'`,
  );
  await h.db.exec(`CREATE FUNCTION reject_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
    CREATE TRIGGER reject_report BEFORE UPDATE ON model_playground_runs FOR EACH ROW WHEN (NEW."reportState"='saved') EXECUTE FUNCTION reject_report();`);
  const failed = await recoverModelPlaygroundReports(h.database, { limit: 1 });
  expect(failed).toMatchObject({ ok: true, attempted: 1, saved: 0 });
  if (!failed.ok || !failed.next) throw new Error("Expected failure cursor");
  const exact = (
    await h.db.query<{ createdAt: string }>(
      `SELECT to_char("createdAt",'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt" FROM model_playground_runs WHERE id=$1`,
      [first.id],
    )
  ).rows[0].createdAt;
  expect(failed.next.createdAt).toBe(exact);
  await h.db.exec(`DROP TRIGGER reject_report ON model_playground_runs`);
  expect(
    await recoverModelPlaygroundReports(h.database, { limit: 1, after: failed.next }),
  ).toMatchObject({ ok: true, attempted: 1, saved: 1 });
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({ ok: true, attempted: 0 });
  await h.db.query(
    `UPDATE model_playground_runs SET "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
    [first.id],
  );
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
    ok: true,
    attempted: 1,
    saved: 1,
  });
  expect(await count()).toBe(2);
});

test("limit-1 cursor advances when failure bookkeeping is unavailable", async () => {
  await h.db.exec(`ALTER TABLE model_playground_runs ALTER COLUMN "createdAt" TYPE timestamp(6)`);
  const first = await h.launch();
  const second = await h.launch();
  for (const run of [first, second])
    expect(
      (await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: run.id }, []))
        .ok,
    ).toBe(true);
  const firstReport = (await h.store.read("project-a", first.id)).reportId;
  // Pin nonzero sub-millisecond storage precision only in this disposable fixture.
  await withoutFixtureTrigger(
    h.db,
    "model_playground_runs",
    "model_playground_run_immutable",
    async () => {
      await h.db.query(
        `UPDATE model_playground_runs SET "createdAt"=date_trunc('milliseconds',"createdAt")+INTERVAL '123 microseconds',"reportState"='saved_stale',"reportFailure"='storage',"reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
        [first.id],
      );
      await h.db.query(
        `UPDATE model_playground_runs SET "reportState"='saved_stale',"reportFailure"='storage',"reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
        [second.id],
      );
    },
  );
  await h.db.exec(`CREATE FUNCTION reject_bookkeeping() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$;
    CREATE TRIGGER reject_body BEFORE UPDATE ON agent_reports FOR EACH ROW EXECUTE FUNCTION reject_bookkeeping();
    CREATE TRIGGER reject_failure BEFORE UPDATE ON model_playground_runs FOR EACH ROW EXECUTE FUNCTION reject_bookkeeping();`);
  const failed = await recoverModelPlaygroundReports(h.database, { limit: 1 });
  expect(failed).toMatchObject({ ok: true, attempted: 1, saved: 0 });
  if (!failed.ok || !failed.next) throw new Error("Expected cursor");
  expect(failed.next.id).toBe(first.id);
  await h.db.exec(
    `DROP TRIGGER reject_body ON agent_reports; DROP TRIGGER reject_failure ON model_playground_runs`,
  );
  expect(
    await recoverModelPlaygroundReports(h.database, { limit: 1, after: failed.next }),
  ).toMatchObject({ ok: true, attempted: 1, saved: 1 });
  expect((await h.store.read("project-a", first.id)).reportId).toBe(firstReport);
  expect((await h.store.read("project-a", second.id)).reportId).toBeTruthy();
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
    ok: true,
    attempted: 1,
    saved: 1,
  });
});

test("a pre-save failure backs off the saved_stale head", async () => {
  const run = await h.launch();
  expect(
    (await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: run.id }, [])).ok,
  ).toBe(true);
  await h.db.query(
    `UPDATE model_playground_runs SET "reportState"='saved_stale',"reportFailure"='storage',"reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
    [run.id],
  );
  const [before] = (
    await h.db.query<{ reportAttemptedAt: Date }>(
      `SELECT "reportAttemptedAt" FROM model_playground_runs WHERE id=$1`,
      [run.id],
    )
  ).rows;
  entities.fail = true;
  try {
    expect(await recoverModelPlaygroundReports(h.database, { limit: 1 })).toMatchObject({
      ok: true,
      attempted: 1,
      saved: 0,
    });
    const [after] = (
      await h.db.query<{ reportAttemptedAt: Date }>(
        `SELECT "reportAttemptedAt" FROM model_playground_runs WHERE id=$1`,
        [run.id],
      )
    ).rows;
    expect(after.reportAttemptedAt.getTime()).toBeGreaterThan(
      before.reportAttemptedAt.getTime() + 200_000,
    );
  } finally {
    entities.fail = false;
  }
  expect(await recoverModelPlaygroundReports(h.database, { limit: 1 })).toMatchObject({
    ok: true,
    attempted: 0,
  });
});

test("a throw inside save backs off a linked saved_stale row", async () => {
  const run = await h.launch();
  expect(
    (await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: run.id }, [])).ok,
  ).toBe(true);
  await h.db.query(
    `UPDATE model_playground_runs SET "reportState"='saved_stale',"reportFailure"='storage',"reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
    [run.id],
  );
  const [before] = (
    await h.db.query<{ reportAttemptedAt: Date }>(
      `SELECT "reportAttemptedAt" FROM model_playground_runs WHERE id=$1`,
      [run.id],
    )
  ).rows;
  const read = vi.spyOn(store, "readStoredRun").mockRejectedValue(new Error("run storage"));
  try {
    expect(await recoverModelPlaygroundReports(h.database, { limit: 1 })).toMatchObject({
      ok: true,
      attempted: 1,
      saved: 0,
    });
    const [after] = (
      await h.db.query<{ reportAttemptedAt: Date }>(
        `SELECT "reportAttemptedAt" FROM model_playground_runs WHERE id=$1`,
        [run.id],
      )
    ).rows;
    expect(after.reportAttemptedAt.getTime()).toBeGreaterThan(
      before.reportAttemptedAt.getTime() + 200_000,
    );
  } finally {
    read.mockRestore();
  }
  expect(await recoverModelPlaygroundReports(h.database, { limit: 1 })).toMatchObject({
    ok: true,
    attempted: 0,
  });
});

test("repair backoff does not write while the project is held", async () => {
  const run = await h.launch();
  expect(
    (await saveModelPlaygroundReport(h.database, { projectId: "project-a", runId: run.id }, [])).ok,
  ).toBe(true);
  await h.db.query(
    `UPDATE model_playground_runs SET "reportState"='saved_stale',"reportFailure"='storage',"reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
    [run.id],
  );
  const [before] = (
    await h.db.query<{ reportAttemptedAt: Date }>(
      `SELECT "reportAttemptedAt" FROM model_playground_runs WHERE id=$1`,
      [run.id],
    )
  ).rows;
  entities.fail = true;
  entities.beforeLoad = async () => {
    await h.db.query(`UPDATE projects SET "writeMode"='migration_hold' WHERE id='project-a'`);
  };
  try {
    expect(await recoverModelPlaygroundReports(h.database, { limit: 1 })).toMatchObject({
      ok: true,
      attempted: 1,
      saved: 0,
    });
    const [after] = (
      await h.db.query<{ reportAttemptedAt: Date }>(
        `SELECT "reportAttemptedAt" FROM model_playground_runs WHERE id=$1`,
        [run.id],
      )
    ).rows;
    expect(after.reportAttemptedAt.getTime()).toBe(before.reportAttemptedAt.getTime());
  } finally {
    entities.fail = false;
    entities.beforeLoad = null;
    await h.db.query(`UPDATE projects SET "writeMode"='active' WHERE id='project-a'`);
  }
});
