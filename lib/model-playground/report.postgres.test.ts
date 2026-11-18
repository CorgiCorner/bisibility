import { expect, it } from "vitest";
import { MODEL_IN_FLIGHT_MS } from "./admission-state";
import { readRetainedModelRun } from "./history";
import { historyHarness } from "./history.test-support";
import { withFixtureRestore } from "./launch-database.test-support";
import { saveModelPlaygroundReport } from "./report";
import { recoverModelPlaygroundReports } from "./report-recovery";
import { entities } from "./result-fixtures.test-support";

const h = historyHarness();

// Fixture writes that bypass the column integrity trigger re-enable it even when the write throws.
async function withoutColumnIntegrity(sql: string, params: unknown[]) {
  await h.db.exec(
    `ALTER TABLE model_playground_columns DISABLE TRIGGER model_playground_column_integrity`,
  );
  try {
    await h.db.query(sql, params);
  } finally {
    await h.db.exec(
      `ALTER TABLE model_playground_columns ENABLE TRIGGER model_playground_column_integrity`,
    );
  }
}

const transitions: Array<readonly [string, () => Promise<void>]> = [];
const scenario = (name: string, run: () => Promise<void>) => transitions.push([name, run]);

for (const terminal of [false, true])
  scenario(`handles terminal=${terminal} without changing answers`, async () => {
    const run = await h.launch(terminal);
    const before = await h.store.read("project-a", run.id);
    const save = await saveModelPlaygroundReport(
      h.database,
      { projectId: "project-a", runId: run.id },
      entities,
    );
    expect(save.ok).toBe(terminal);
    if (!terminal) expect(save).toEqual({ ok: false, reason: "pending" });
    const after = await h.store.read("project-a", run.id);
    expect(after.columns).toEqual(before.columns);
  });
scenario("saves one report when callers overlap and reopens the full result offline", async () => {
  const run = await h.launch();
  const input = { projectId: "project-a", runId: run.id };
  const saves = await Promise.all([
    saveModelPlaygroundReport(h.database, input, entities),
    saveModelPlaygroundReport(h.database, input, entities),
  ]);
  expect(saves).toEqual([
    { ok: true, reportId: expect.any(String), alreadySaved: false },
    { ok: true, reportId: expect.any(String), alreadySaved: true },
  ]);
  if (saves[0].ok && saves[1].ok) expect(saves[0].reportId).toBe(saves[1].reportId);
  expect((await h.db.query(`SELECT * FROM agent_reports`)).rows).toHaveLength(1);
  const read = await readRetainedModelRun(h.database, input);
  expect(read.ok && read.run.columns[0].result?.answer).toBe("An answer with two citations.");
  expect(await readRetainedModelRun(h.database, { ...input, projectId: "project-b" })).toEqual({
    ok: false,
    reason: "not_found",
  });
});
scenario("rolls back a failed attachment without losing the paid answer then retries", async () => {
  const run = await h.launch();
  await h.db.exec(
    `CREATE FUNCTION reject_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER reject_report BEFORE UPDATE ON model_playground_runs FOR EACH ROW EXECUTE FUNCTION reject_report();`,
  );
  const input = { projectId: "project-a", runId: run.id };
  try {
    expect(await saveModelPlaygroundReport(h.database, input, entities)).toEqual({
      ok: false,
      reason: "storage",
    });
    expect((await h.db.query(`SELECT * FROM agent_reports`)).rows).toHaveLength(0);
    expect((await h.store.read("project-a", run.id)).columns[0].result?.answer).toBeTruthy();
  } finally {
    await h.db.exec(`DROP TRIGGER reject_report ON model_playground_runs;`);
  }
  expect((await saveModelPlaygroundReport(h.database, input, entities)).ok).toBe(true);
});

scenario("saves a terminal unknown attempt without inventing an answer or timing", async () => {
  const run = await h.launch(false);
  const lease = await h.store.claim({
    projectId: "project-a",
    runId: run.id,
    columnId: run.columns[0].columnId,
    leaseSeconds: 300,
  });
  if (!lease) throw new Error("Expected lease");
  const identity = {
    projectId: "project-a",
    runId: run.id,
    columnId: lease.columnId,
    leaseToken: lease.leaseToken,
  };
  await h.store.fenceDispatch(identity);
  await h.db.query(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE "runId"=$1`,
    [run.id],
  );
  expect(await h.store.expireDispatched(identity)).toBe(true);
  expect(
    await saveModelPlaygroundReport(
      h.database,
      { projectId: "project-a", runId: run.id },
      entities,
    ),
  ).toEqual({ ok: false, reason: "pending" });
  // Backdate immutable dispatch timing only to simulate an elapsed wall-clock window.
  await withoutColumnIntegrity(
    `UPDATE model_playground_columns SET "dispatchStartedAt"=CURRENT_TIMESTAMP-INTERVAL '151 seconds' WHERE "runId"=$1`,
    [run.id],
  );

  expect(
    (
      await saveModelPlaygroundReport(
        h.database,
        { projectId: "project-a", runId: run.id },
        entities,
      )
    ).ok,
  ).toBe(true);
  const rows = (
    await h.db.query<{ body: { results: unknown[] } }>(`SELECT body FROM agent_reports`)
  ).rows;
  expect(rows[0].body.results).toEqual([
    { column: run.snapshot.input.columns[0], state: "unknown", answer: null },
  ]);
});

async function reportCustody(runId: string) {
  const [run] = (
    await h.db.query<{
      reportState: string;
      reportFailure: string | null;
      reportAttemptedAt: Date | null;
      reportId: string | null;
    }>(
      `SELECT "reportState","reportFailure","reportAttemptedAt","reportId" FROM model_playground_runs WHERE id=$1`,
      [runId],
    )
  ).rows;
  const [report] = (
    await h.db.query<{ id: string; body: unknown; publicId: string; createdAt: Date }>(
      `SELECT id,body,"publicId","createdAt" FROM agent_reports WHERE id=(SELECT "reportId" FROM model_playground_runs WHERE id=$1)`,
      [runId],
    )
  ).rows;
  return { run, report };
}

scenario("held project auto-save of a saved current report changes no row", async () => {
  for (const mode of ["migration_hold", "migrated"] as const) {
    const run = await h.launch();
    const input = { projectId: "project-a", runId: run.id };
    const saved = await saveModelPlaygroundReport(h.database, input, entities);
    if (!saved.ok) throw new Error("Expected saved report");
    await h.db.query(`UPDATE projects SET "writeMode"=$1 WHERE id='project-a'`, [mode]);
    try {
      const before = await reportCustody(run.id);
      expect(
        await saveModelPlaygroundReport(h.database, input, entities, false, false, {
          userSave: true,
        }),
      ).toEqual({
        ok: true,
        reportId: before.report.publicId,
        alreadySaved: true,
      });
      expect(await reportCustody(run.id)).toEqual(before);
    } finally {
      await h.db.query(`UPDATE projects SET "writeMode"='active' WHERE id='project-a'`);
    }
  }
});

scenario("held saved_stale past backoff is omitted from both recovery sweeps", async () => {
  const run = await h.launch();
  const heldNone = await h.launch();
  const input = { projectId: "project-a", runId: run.id };
  const saved = await saveModelPlaygroundReport(h.database, input, entities);
  if (!saved.ok) throw new Error("Expected saved report");
  await h.db.query(`UPDATE projects SET "writeMode"='migration_hold' WHERE id='project-a'`);
  try {
    await h.db.query(
      `UPDATE model_playground_runs SET "reportState"='saved_stale',"reportFailure"='storage',"reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
      [run.id],
    );
    const before = await reportCustody(run.id);
    const noneBefore = await reportCustody(heldNone.id);
    expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
      ok: true,
      attempted: 0,
    });
    expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
      ok: true,
      attempted: 0,
    });
    expect(await reportCustody(run.id)).toEqual(before);
    expect(await reportCustody(heldNone.id)).toEqual(noneBefore);
    expect(await saveModelPlaygroundReport(h.database, input, entities, true, false)).toEqual({
      ok: false,
      reason: "held",
    });
    expect(await reportCustody(run.id)).toEqual(before);
  } finally {
    await h.db.query(`UPDATE projects SET "writeMode"='active' WHERE id='project-a'`);
  }
});

scenario("held none run auto-save returns read_only", async () => {
  const run = await h.launch();
  const input = { projectId: "project-a", runId: run.id };
  await h.db.query(`UPDATE projects SET "writeMode"='migration_hold' WHERE id='project-a'`);
  try {
    expect(await saveModelPlaygroundReport(h.database, input, entities, false, false)).toEqual({
      ok: false,
      reason: "read_only",
    });
    expect(await saveModelPlaygroundReport(h.database, input, entities, true, false)).toEqual({
      ok: false,
      reason: "read_only",
    });
  } finally {
    await h.db.query(`UPDATE projects SET "writeMode"='active' WHERE id='project-a'`);
  }
});

scenario("active none save proceeds past the read-only gate", async () => {
  const run = await h.launch();
  const saved = await saveModelPlaygroundReport(
    h.database,
    { projectId: "project-a", runId: run.id },
    entities,
    true,
    false,
  );
  expect(saved.ok).toBe(true);
});

it.each(["infinity", "-infinity"])("rejects non-finite %s dispatch timestamps", async (timing) => {
  const located = (
    await h.db.query<{ nspname: string }>(
      `SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname IN ('model_playground_columns','model_playground_payment_attempts') AND n.nspname=current_schema()`,
    )
  ).rows;
  expect(located).toHaveLength(2);
  expect(located.every((row) => row.nspname !== "public")).toBe(true);
  const run = await h.launch(false);
  const lease = await h.store.claim({
    projectId: "project-a",
    runId: run.id,
    columnId: run.columns[0].columnId,
    leaseSeconds: 300,
  });
  if (!lease?.leaseToken) throw new Error("Expected lease");
  const finite = "2026-11-13T12:00:00.000Z";
  const attemptId = `quote-${timing}`;
  await h.db.exec(
    `ALTER TABLE model_playground_columns DISABLE TRIGGER model_playground_column_integrity`,
  );
  try {
    await h.db.query(
      `UPDATE model_playground_columns SET "dispatchStartedAt"=$2::timestamp WHERE "runId"=$1`,
      [run.id, finite],
    );
    const started = (
      await h.db.query<{ dispatchStartedAt: Date | null }>(
        `SELECT "dispatchStartedAt" FROM model_playground_columns WHERE "runId"=$1`,
        [run.id],
      )
    ).rows[0]?.dispatchStartedAt;
    expect(started).toBeInstanceOf(Date);
    await expect(
      h.db.query(
        `UPDATE model_playground_columns SET "dispatchStartedAt"=$2::timestamp WHERE "runId"=$1`,
        [run.id, timing],
      ),
    ).rejects.toThrow("model_playground_columns_dispatch_finite");
    expect(
      (
        await h.db.query<{ dispatchStartedAt: Date | null }>(
          `SELECT "dispatchStartedAt" FROM model_playground_columns WHERE "runId"=$1`,
          [run.id],
        )
      ).rows[0]?.dispatchStartedAt,
    ).toEqual(started);
    await h.db.query(
      `INSERT INTO model_playground_payment_attempts(quote_id,root_quote_id,column_id,root_column_id,binding,dispatched_at) VALUES($2,$2,$2,$2,'{}'::jsonb,$1::timestamptz)`,
      [finite, attemptId],
    );
    const stored = (
      await h.db.query<{ dispatched_at: Date }>(
        `SELECT dispatched_at FROM model_playground_payment_attempts WHERE quote_id=$1`,
        [attemptId],
      )
    ).rows[0]?.dispatched_at;
    expect(stored).toBeInstanceOf(Date);
    await expect(
      h.db.query(
        `UPDATE model_playground_payment_attempts SET dispatched_at=$2::timestamptz WHERE quote_id=$1`,
        [attemptId, timing],
      ),
    ).rejects.toThrow("model_playground_payment_attempts_dispatch_finite");
    expect(
      (
        await h.db.query<{ dispatched_at: Date }>(
          `SELECT dispatched_at FROM model_playground_payment_attempts WHERE quote_id=$1`,
          [attemptId],
        )
      ).rows[0]?.dispatched_at,
    ).toEqual(stored);
  } finally {
    await h.db.exec(
      `ALTER TABLE model_playground_columns ENABLE TRIGGER model_playground_column_integrity`,
    );
  }
  expect(
    (
      await h.db.query<{ tgenabled: string }>(
        `SELECT tgenabled FROM pg_trigger WHERE tgname='model_playground_column_integrity' AND tgrelid='model_playground_columns'::regclass`,
      )
    ).rows[0]?.tgenabled,
  ).toBe("O");
});

scenario("held linked user save stays saved with the report id", async () => {
  const run = await h.launch();
  const input = { projectId: "project-a", runId: run.id };
  const saved = await saveModelPlaygroundReport(h.database, input, entities);
  if (!saved.ok) throw new Error("Expected saved report");
  await h.db.query(`UPDATE projects SET "writeMode"='migration_hold' WHERE id='project-a'`);
  try {
    expect(
      await saveModelPlaygroundReport(h.database, input, entities, false, true, { userSave: true }),
    ).toEqual({
      ok: true,
      reportId: saved.reportId,
      alreadySaved: true,
    });
  } finally {
    await h.db.query(`UPDATE projects SET "writeMode"='active' WHERE id='project-a'`);
  }
});

// Reinstall before validation so a failed repair still leaves future writes guarded.
async function restoreDispatchFinite(runId: string) {
  await withFixtureRestore(
    () =>
      withoutColumnIntegrity(
        `UPDATE model_playground_columns SET "dispatchStartedAt"=NULL WHERE "runId"=$1`,
        [runId],
      ),
    async () => {
      const [constraint] = (
        await h.db.query<{ present: boolean }>(
          `SELECT true AS present FROM pg_constraint
         WHERE conname='model_playground_columns_dispatch_finite'
           AND conrelid='model_playground_columns'::regclass`,
        )
      ).rows;
      if (!constraint)
        await h.db.exec(
          `ALTER TABLE model_playground_columns ADD CONSTRAINT model_playground_columns_dispatch_finite CHECK ("dispatchStartedAt" IS NULL OR isfinite("dispatchStartedAt")) NOT VALID`,
        );
      await h.db.exec(
        `ALTER TABLE model_playground_columns VALIDATE CONSTRAINT model_playground_columns_dispatch_finite`,
      );
    },
  );
}

async function unknownColumn(runId: string, dispatch: string | null) {
  await withoutColumnIntegrity(
    `UPDATE model_playground_columns SET state='unknown',result=NULL,"finishedAt"=(clock_timestamp() AT TIME ZONE 'UTC'),"dispatchStartedAt"=$2::timestamp WHERE "runId"=$1`,
    [runId, dispatch],
  );
}

scenario("non-finite and missing dispatch leave readiness unknown", async () => {
  const missing = await h.launch(false);
  await unknownColumn(missing.id, null);
  const missingRead = await readRetainedModelRun(h.database, {
    projectId: "project-a",
    runId: missing.id,
  });
  expect(missingRead.ok ? missingRead.readyAt : "missing").toBeNull();
  expect(missingRead.ok ? missingRead.readyInMs : "missing").toBeNull();
  const infinite = await h.launch(false);
  await withFixtureRestore(
    async () => {
      await h.db.exec(
        `ALTER TABLE model_playground_columns DROP CONSTRAINT model_playground_columns_dispatch_finite`,
      );
      await unknownColumn(infinite.id, "infinity");
      const read = await readRetainedModelRun(h.database, {
        projectId: "project-a",
        runId: infinite.id,
      });
      expect(read.ok ? read.readyAt : "missing").toBeNull();
      expect(read.ok ? read.readyInMs : "missing").toBeNull();
    },
    () => restoreDispatchFinite(infinite.id),
  );
  await restoreDispatchFinite(infinite.id);
  expect(
    (
      await h.db.query<{ convalidated: boolean }>(
        `SELECT convalidated FROM pg_constraint WHERE conname='model_playground_columns_dispatch_finite'
     AND conrelid='model_playground_columns'::regclass`,
      )
    ).rows[0]?.convalidated,
  ).toBe(true);
});

scenario("a future dispatch leaves readiness unknown", async () => {
  const run = await h.launch(false);
  await unknownColumn(run.id, null);
  await withoutColumnIntegrity(
    `UPDATE model_playground_columns SET "dispatchStartedAt"=(clock_timestamp() AT TIME ZONE 'UTC')+INTERVAL '5 seconds' WHERE "runId"=$1`,
    [run.id],
  );
  const read = await readRetainedModelRun(h.database, { projectId: "project-a", runId: run.id });
  expect(read.ok ? read.readyAt : "missing").toBeNull();
  expect(read.ok ? read.readyInMs : "missing").toBeNull();
});

scenario("a linked hold stays held until a user save opts in", async () => {
  const run = await h.launch();
  const input = { projectId: "project-a", runId: run.id };
  const saved = await saveModelPlaygroundReport(h.database, input, entities);
  if (!saved.ok) throw new Error("Expected saved report");
  await h.db.query(`UPDATE projects SET "writeMode"='migration_hold' WHERE id='project-a'`);
  try {
    const before = await reportCustody(run.id);
    expect(await saveModelPlaygroundReport(h.database, input, entities)).toEqual({
      ok: false,
      reason: "held",
    });
    expect(
      await saveModelPlaygroundReport(h.database, input, entities, false, true, {
        userSave: true,
      }),
    ).toEqual({ ok: true, reportId: saved.reportId, alreadySaved: true });
    expect(await reportCustody(run.id)).toEqual(before);
  } finally {
    await h.db.query(`UPDATE projects SET "writeMode"='active' WHERE id='project-a'`);
  }
});

scenario("two reads of one waiting column return the same readyAt", async () => {
  const run = await h.launch(false);
  await withoutColumnIntegrity(
    `UPDATE model_playground_columns SET state='unknown',result=NULL,"finishedAt"=(clock_timestamp() AT TIME ZONE 'UTC'),"dispatchStartedAt"=date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '10 seconds' WHERE "runId"=$1`,
    [run.id],
  );
  const input = { projectId: "project-a", runId: run.id };
  const first = await readRetainedModelRun(h.database, input);
  const second = await readRetainedModelRun(h.database, input);
  const [expected] = (
    await h.db.query<{ readyAtMs: number }>(
      `SELECT (CEIL(EXTRACT(EPOCH FROM "dispatchStartedAt") * 1000) + $2::double precision) AS "readyAtMs" FROM model_playground_columns WHERE "runId"=$1`,
      [run.id, MODEL_IN_FLIGHT_MS],
    )
  ).rows;
  if (!first.ok || !second.ok || !first.readyAt || !second.readyAt || !expected)
    throw new Error("Expected a stable window");
  expect(second.readyAt).toBe(first.readyAt);
  expect(Date.parse(first.readyAt)).toBe(Number(expected.readyAtMs));
});

scenario("a future dispatch cannot push readyAt past the observation window", async () => {
  const run = await h.launch(false);
  const lease = await h.store.claim({
    projectId: "project-a",
    runId: run.id,
    columnId: run.columns[0].columnId,
    leaseSeconds: 300,
  });
  if (!lease?.leaseToken) throw new Error("Expected lease");
  await h.store.fenceDispatch({
    projectId: "project-a",
    runId: run.id,
    columnId: lease.columnId,
    leaseToken: lease.leaseToken,
  });
  await withoutColumnIntegrity(
    `UPDATE model_playground_columns SET state='unknown',result=NULL,"finishedAt"=(clock_timestamp() AT TIME ZONE 'UTC'),"dispatchStartedAt"=(clock_timestamp() AT TIME ZONE 'UTC')+INTERVAL '5 seconds' WHERE "runId"=$1`,
    [run.id],
  );
  const read = await readRetainedModelRun(h.database, { projectId: "project-a", runId: run.id });
  expect(read.ok ? read.readyAt : "missing").toBeNull();
  expect(read.ok ? read.readyInMs : "missing").toBeNull();
});

it.each(transitions)("%s", async (_name, run) => run());
