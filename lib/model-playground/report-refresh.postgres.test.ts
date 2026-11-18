import { expect, test, vi } from "vitest";
import { result } from "./contract-fixtures.test-support";
import { historyHarness } from "./history.test-support";
import { withoutFixtureTrigger } from "./launch-database.test-support";
import { saveModelPlaygroundReport } from "./report";
import { recoverModelPlaygroundReports } from "./report-recovery";
import { refreshSavedModelReport } from "./report-refresh";
import { completeModelRunColumn } from "./store-terminal";
import { type ModelColumnResult, modelColumnResultSchema } from "./types";

vi.mock("./report-context", () => ({ loadModelReportEntities: async () => [] }));
vi.mock("./database", () => ({ modelPlaygroundDatabase: {} }));
const h = historyHarness();
const linkedReport = `id=(SELECT "reportId" FROM model_playground_runs WHERE id=$1)`;

async function linkedReportRow(runId: string) {
  const [row] = (
    await h.db.query<{ body: { results: { answer: string | null }[] }; publicId: string }>(
      `SELECT body,"publicId" FROM agent_reports WHERE ${linkedReport}`,
      [runId],
    )
  ).rows;
  return row;
}

async function savedUnknown() {
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
    `INSERT INTO model_playground_payment_attempts(quote_id,column_id,dispatched_at,binding) VALUES($1,$2,CURRENT_TIMESTAMP-INTERVAL '151 seconds',$3::jsonb)`,
    [run.previewId, lease.columnId, JSON.stringify({ projectId: "project-a" })],
  );
  const saved = await saveModelPlaygroundReport(
    h.database,
    { projectId: identity.projectId, runId: identity.runId },
    [],
  );
  if (!saved.ok) throw new Error("Expected saved unknown");
  return { run, identity, saved };
}

const retain = (
  identity: { projectId: string; runId: string; columnId: string },
  paid: ModelColumnResult,
  refresh = false,
) =>
  completeModelRunColumn(h.database, identity, async (tx) => {
    await tx.$queryRawUnsafe(
      `UPDATE model_playground_columns SET state='completed',result=$4::jsonb,"finishedAt"=(clock_timestamp() AT TIME ZONE 'UTC') WHERE "projectId"=$1 AND "runId"=$2 AND "columnId"=$3 AND result IS NULL`,
      identity.projectId,
      identity.runId,
      identity.columnId,
      JSON.stringify(modelColumnResultSchema.parse(paid)),
    );
    if (refresh) await refreshSavedModelReport(tx, identity);
    return true;
  });
const cases = ["active", "migration_hold", "migrated", "storage", "too_large", "conflict"] as const;
test.each(cases)("late answer transition: %s", async (mode) => {
  const { run, identity, saved } = await savedUnknown();
  const paid = result();
  if (mode === "migration_hold" || mode === "migrated")
    await h.db.query(`UPDATE projects SET "writeMode"=$1 WHERE id='project-a'`, [mode]);
  if (mode === "storage")
    await h.db.exec(`CREATE FUNCTION reject_refresh() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$;
    CREATE TRIGGER reject_refresh BEFORE UPDATE ON agent_reports FOR EACH ROW EXECUTE FUNCTION reject_refresh()`);
  if (mode === "too_large") {
    // Valid frozen context fits alone, but not beside a large retained paid answer.
    await h.db.query(
      `UPDATE agent_reports SET body=jsonb_set(body,'{entities}', '[{"id":"brand","kind":"project","label":"Brand","domain":null,"aliases":[],"excludedNames":[]}]'::jsonb) WHERE ${linkedReport}`,
      [run.id],
    );
    await h.db.query(
      `UPDATE agent_reports SET body=jsonb_set(body,'{entities,0,aliases}', $2::jsonb) WHERE ${linkedReport}`,
      [run.id, JSON.stringify(["a".repeat(245000)])],
    );
    paid.answer = "a".repeat(24000);
  }
  if (mode === "conflict")
    await h.db.query(`UPDATE agent_reports SET body=body-'version' WHERE ${linkedReport}`, [
      run.id,
    ]);
  await retain(identity, paid);
  expect((await h.store.read("project-a", run.id)).columns[0].result?.answer).toBe(paid.answer);
  if (mode === "conflict") {
    expect(
      await saveModelPlaygroundReport(
        h.database,
        { projectId: identity.projectId, runId: identity.runId },
        [],
      ),
    ).toEqual({ ok: false, reason: "conflict" });
    expect(
      (
        await h.db.query(
          `SELECT "reportState","reportFailure" FROM model_playground_runs WHERE id=$1`,
          [run.id],
        )
      ).rows[0],
    ).toMatchObject({ reportState: "saved_stale", reportFailure: "conflict" });
    return;
  }
  const held = mode === "migration_hold" || mode === "migrated";
  expect(
    await saveModelPlaygroundReport(
      h.database,
      { projectId: identity.projectId, runId: identity.runId },
      [],
      false,
      false,
      held ? { userSave: true } : undefined,
    ),
  ).toEqual({ ...saved, alreadySaved: true });
  const [row] = (
    await h.db.query<{ reportState: string; reportFailure: string | null }>(
      `SELECT "reportState","reportFailure" FROM model_playground_runs WHERE id=$1`,
      [run.id],
    )
  ).rows;
  expect(row).toEqual(
    mode === "active" || held
      ? { reportState: "saved", reportFailure: null }
      : {
          reportState: "saved_stale",
          reportFailure: mode === "too_large" ? "too_large" : "storage",
        },
  );
  expect((await linkedReportRow(run.id)).body.results[0].answer).toBe(
    mode === "active" ? paid.answer : null,
  );
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({ ok: true, attempted: 0 });
  if (mode === "storage") {
    await h.db.query(
      `UPDATE model_playground_runs SET "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
      [run.id],
    );
    expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
      ok: true,
      attempted: 1,
      saved: 0,
      failed: 1,
    });
    expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
      ok: true,
      attempted: 0,
    });
    await h.db.exec(`DROP TRIGGER reject_refresh ON agent_reports`);
  }
  await h.db.exec(`UPDATE projects SET "writeMode"='active'`);
  await h.db.query(
    `UPDATE model_playground_runs SET "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
    [run.id],
  );
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
    ok: true,
    attempted: mode === "storage" ? 1 : 0,
  });
  if (mode === "active" || mode === "storage") {
    const refreshed = await linkedReportRow(run.id);
    expect(refreshed.publicId).toBe(saved.reportId);
    expect(refreshed.body.results[0].answer).toBe(paid.answer);
  }
  if (held) expect((await linkedReportRow(run.id)).body.results[0].answer).toBeNull();
});

test.each([false, true])("deletion tombstones after unlink first=%s", async (unlink) => {
  const { identity } = await savedUnknown();
  const [report] = (
    await h.db.query<{ id: string }>(`SELECT id FROM agent_reports WHERE ${linkedReport}`, [
      identity.runId,
    ])
  ).rows;
  if (unlink)
    await h.db.query(`UPDATE model_playground_runs SET "reportId"=NULL WHERE id=$1`, [
      identity.runId,
    ]);
  await h.db.query(`DELETE FROM agent_reports WHERE id=$1`, [report.id]);
  expect(
    await saveModelPlaygroundReport(
      h.database,
      { projectId: identity.projectId, runId: identity.runId },
      [],
    ),
  ).toEqual({ ok: false, reason: "dismissed" });
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({ ok: true, attempted: 0 });
});

test("only explicit user intent classifies an unclassified legacy run", async () => {
  const run = await h.launch();
  const identity = { projectId: "project-a", runId: run.id };
  await h.db.query(`UPDATE model_playground_runs SET "reportState"='unclassified' WHERE id=$1`, [
    run.id,
  ]);
  expect(
    await saveModelPlaygroundReport(
      h.database,
      { projectId: identity.projectId, runId: identity.runId },
      [],
    ),
  ).toEqual({ ok: false, reason: "unclassified" });
  expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({ ok: true, attempted: 0 });
  expect(
    await saveModelPlaygroundReport(
      h.database,
      { projectId: identity.projectId, runId: identity.runId },
      [],
      false,
      true,
    ),
  ).toMatchObject({ ok: true, alreadySaved: false });
});

test.skipIf(!process.env.MODEL_LAUNCH_TEST_DATABASE_URL).each(["project", "report"])(
  "real %s NOWAIT conflict preserves answer and saved identity, then sweep repairs",
  async (resource) => {
    const { run, identity, saved } = await savedUnknown();
    let unlock!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const blocker = h.db.transaction(async (tx) => {
      await tx.query(
        resource === "project"
          ? `SELECT id FROM projects WHERE id='project-a' FOR UPDATE`
          : `SELECT id FROM agent_reports WHERE ${linkedReport} FOR UPDATE`,
        resource === "project" ? [] : [run.id],
      );
      locked();
      await release;
    });
    await held;
    try {
      await retain(identity, result(), resource === "project");
      expect((await h.store.read("project-a", run.id)).columns[0].result?.answer).toBe(
        result().answer,
      );
      if (resource === "report")
        expect(
          await saveModelPlaygroundReport(
            h.database,
            { projectId: identity.projectId, runId: identity.runId },
            [],
          ),
        ).toEqual({ ...saved, alreadySaved: true });
      expect(
        (
          await h.db.query(
            `SELECT "reportState","reportFailure" FROM model_playground_runs WHERE id=$1`,
            [run.id],
          )
        ).rows[0],
      ).toMatchObject({ reportState: "saved_stale", reportFailure: "storage" });
    } finally {
      unlock();
      await blocker;
    }
    expect((await linkedReportRow(run.id)).body.results[0].answer).toBeNull();
    expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
      ok: true,
      attempted: 0,
    });
    await h.db.query(
      `UPDATE model_playground_runs SET "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
      [run.id],
    );
    expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
      ok: true,
      attempted: 1,
      saved: 1,
    });
    expect(
      await saveModelPlaygroundReport(
        h.database,
        { projectId: identity.projectId, runId: identity.runId },
        [],
      ),
    ).toEqual({ ...saved, alreadySaved: true });
    expect((await linkedReportRow(run.id)).body.results[0].answer).toBe(result().answer);
  },
  20000,
);
