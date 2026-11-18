import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { readModelAttempts } from "./admission-storage";
import { executeModelPlayground } from "./execute";
import { launchHarness } from "./launch.test-support";
import { withoutFixtureTrigger } from "./launch-database.test-support";
import { previewModelPlayground } from "./preview";
import { sweepModelPlaygroundRecovery } from "./recovery-schedule";
import * as reportFinalize from "./report-finalize";
import { deliverModelPlaygroundTerminalReport } from "./report-terminal";
import { finalizeModelPlaygroundExecution, recoverModelPlaygroundTerminalHooks } from "./terminal";

vi.mock("./report-context", () => ({ loadModelReportEntities: async () => [] }));

const h = launchHarness();
beforeEach(async () => {
  vi.mocked(reportFinalize.finalizeModelPlaygroundReport).mockRestore();
  await h.sql.exec(`ALTER TABLE agent_reports ADD COLUMN "publicId" text UNIQUE,
    ADD COLUMN kind text, ADD COLUMN title text, ADD COLUMN body jsonb,
    ADD COLUMN provenance jsonb, ADD COLUMN "createdById" text,
    ADD COLUMN "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP`);
});
afterEach(() => {
  delete h.runtime.onTerminal;
});

async function admitted() {
  const quote = await previewModelPlayground(h.runtime, { revision: "test", input: h.input });
  const run = await h.admitOnly(quote);
  const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, quote.previewId));
  return { projectId: h.context.projectId, runId: run.id, attempts };
}

const reports = async () =>
  Number(
    (await h.sql.query<{ n: string }>("SELECT count(*)::text AS n FROM agent_reports")).rows[0].n,
  );

// biome-ignore format: the row shape stays on one line so this file remains within the line limit.
async function row(runId: string) {
  const [value] = (await h.sql.query<{ terminalRevision: number; terminalHookDeliveredRevision: number; terminalHookAttempts: number; terminalHookAttemptBase: number; terminalHookNextAt: Date | null; reportState: string; answer: string | null }>(`SELECT r."terminalRevision",r."terminalHookDeliveredRevision",r."terminalHookAttempts",r."terminalHookAttemptBase",r."terminalHookNextAt",r."reportState",c.result->>'answer' AS answer FROM model_playground_runs r JOIN model_playground_columns c ON c."runId"=r.id WHERE r.id=$1`, [runId])).rows;
  return value;
}

async function body(runId: string) {
  const [value] = (
    await h.sql.query<{ answer: string | null }>(
      `SELECT a.body->'results'->0->>'answer' AS answer FROM agent_reports a
       JOIN model_playground_runs r ON r."reportId"=a.id WHERE r.id=$1`,
      [runId],
    )
  ).rows;
  return value?.answer ?? null;
}

async function due(runId: string) {
  await h.sql.query(
    `UPDATE model_playground_runs SET "terminalHookNextAt"=clock_timestamp()-INTERVAL '1 second' WHERE id=$1`,
    [runId],
  );
}

test("a NOWAIT conflict is acknowledged and the sweep repairs the late answer", async () => {
  const input = await admitted();
  h.runtime.onTerminal = deliverModelPlaygroundTerminalReport;
  await executeModelPlayground(h.runtime, input);
  const original = await body(input.runId);
  await withoutFixtureTrigger(
    h.sql,
    "model_playground_columns",
    "model_playground_column_integrity",
    async () => {
      await h.sql.query(
        `UPDATE model_playground_columns SET result=jsonb_set(result,'{answer}',$2::jsonb) WHERE "runId"=$1`,
        [input.runId, JSON.stringify("Later paid answer")],
      );
    },
  );
  await h.sql.query(
    `UPDATE model_playground_runs SET "terminalRevision"="terminalRevision"+1,"terminalHookNextAt"=NULL WHERE id=$1`,
    [input.runId],
  );
  let unlock!: () => void;
  let locked!: () => void;
  const held = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const release = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const blocker = h.sql.transaction(async (tx) => {
    await tx.query(
      `SELECT id FROM agent_reports WHERE id=(SELECT "reportId" FROM model_playground_runs WHERE id=$1) FOR UPDATE`,
      [input.runId],
    );
    locked();
    await release;
  });
  await held;
  try {
    await finalizeModelPlaygroundExecution(h.runtime, input);
  } finally {
    unlock();
    await blocker;
  }
  const acked = await row(input.runId);
  expect(acked.reportState).toBe("saved_stale");
  expect(acked.terminalHookDeliveredRevision).toBe(acked.terminalRevision);
  expect(await body(input.runId)).toBe(original);
  await h.sql.query(
    `UPDATE model_playground_runs SET "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
    [input.runId],
  );
  await sweepModelPlaygroundRecovery(h.runtime.db);
  expect(await body(input.runId)).toBe("Later paid answer");
  expect((await row(input.runId)).reportState).toBe("saved");
});

test("the locked hold is the delivery decision after the mode changes", async () => {
  const input = await admitted();
  h.runtime.onTerminal = deliverModelPlaygroundTerminalReport;
  await executeModelPlayground(h.runtime, input);
  const original = await body(input.runId);
  await h.sql.query(
    `UPDATE model_playground_runs SET "terminalRevision"="terminalRevision"+1,"terminalHookNextAt"=NULL WHERE id=$1`,
    [input.runId],
  );
  const real = h.runtime.db.$transaction.bind(h.runtime.db);
  h.runtime.db.$transaction = ((work: (tx: unknown) => Promise<unknown>) =>
    real(async (tx) => {
      const client = tx as {
        $queryRawUnsafe: <T>(sql: string, ...args: unknown[]) => Promise<T>;
      };
      return work({
        ...tx,
        $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
          if (sql.includes("writeMode") && sql.includes("FOR SHARE")) {
            await client.$queryRawUnsafe(
              `UPDATE projects SET "writeMode"='migration_hold' WHERE id=$1`,
              input.projectId,
            );
            const rows = await client.$queryRawUnsafe(sql, ...args);
            await client.$queryRawUnsafe(
              `UPDATE projects SET "writeMode"='active' WHERE id=$1`,
              input.projectId,
            );
            return rows;
          }
          return client.$queryRawUnsafe(sql, ...args);
        },
      });
    })) as typeof h.runtime.db.$transaction;
  const before = await row(input.runId);
  try {
    await finalizeModelPlaygroundExecution(h.runtime, input);
  } finally {
    h.runtime.db.$transaction = real;
    await h.sql.query(`UPDATE projects SET "writeMode"='active' WHERE id=$1`, [input.projectId]);
  }
  const held = await row(input.runId);
  expect(held.terminalHookDeliveredRevision).toBeLessThan(held.terminalRevision);
  expect(held.terminalHookAttempts - held.terminalHookAttemptBase).toBe(
    before.terminalHookAttempts - before.terminalHookAttemptBase,
  );
  expect(held.terminalHookNextAt).not.toBeNull();
  expect(await body(input.runId)).toBe(original);
});

test("the first sweep delivers one active run ahead of more than fifty held runs", async () => {
  const input = await admitted();
  await executeModelPlayground(h.runtime, input);
  await h.sql.query(
    `INSERT INTO projects(id,"ownerId") SELECT 'project-held',"ownerId" FROM projects WHERE id=$1`,
    [input.projectId],
  );
  await h.sql.query(`UPDATE projects SET "writeMode"='migration_hold' WHERE id='project-held'`);
  await h.sql.query(
    `INSERT INTO model_playground_previews(id,"projectId","actorId",snapshot,"configHash","expiresAt")
     SELECT 'preview-held','project-held',"actorId",
       jsonb_set(jsonb_set(snapshot,'{projectId}','"project-held"'::jsonb),'{previewId}','"preview-held"'::jsonb),
       "configHash","expiresAt"
     FROM model_playground_previews WHERE id=(SELECT "previewId" FROM model_playground_runs WHERE id=$1)`,
    [input.runId],
  );
  await withoutFixtureTrigger(
    h.sql,
    "model_playground_runs",
    "model_playground_run_immutable",
    async () => {
      await h.sql.query(
        `INSERT INTO model_playground_runs(id,"projectId","actorId","requestId","previewId","configHash",snapshot,"terminalAt","terminalRevision")
       SELECT '00000000-0000-4000-8000-'||lpad(n::text,12,'0'),p."projectId",p."actorId",'held-'||n,p.id,p."configHash",p.snapshot,clock_timestamp(),1
       FROM model_playground_previews p,generate_series(1,51) AS n WHERE p.id='preview-held'`,
      );
    },
  );
  await due(input.runId);
  const seen: string[] = [];
  h.runtime.onTerminal = async (_db, hookInput) => {
    seen.push(hookInput.runId);
    return { revision: hookInput.revision };
  };
  await recoverModelPlaygroundTerminalHooks(h.runtime);
  expect(seen).toEqual([input.runId]);
});

test("a long storage outage is repaired by the report sweep after give-up", async () => {
  const input = await admitted();
  h.runtime.onTerminal = deliverModelPlaygroundTerminalReport;
  await h.sql.exec(`CREATE FUNCTION reject_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture storage'; END $$;
    CREATE TRIGGER reject_insert BEFORE INSERT ON agent_reports FOR EACH ROW EXECUTE FUNCTION reject_insert()`);
  await executeModelPlayground(h.runtime, input);
  for (let attempt = 0; attempt < 4; attempt++) {
    await due(input.runId);
    await finalizeModelPlaygroundExecution(h.runtime, input);
  }
  const givenUp = await row(input.runId);
  expect(givenUp.terminalHookAttempts - givenUp.terminalHookAttemptBase).toBeGreaterThanOrEqual(5);
  expect(await reports()).toBe(0);
  await h.sql.exec(`DROP TRIGGER reject_insert ON agent_reports`);
  await h.sql.query(
    `UPDATE model_playground_runs SET "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
    [input.runId],
  );
  await sweepModelPlaygroundRecovery(h.runtime.db);
  expect(await reports()).toBe(1);
  expect(await body(input.runId)).toBe(givenUp.answer);
});

test("four failures then a hold undo only that claim", async () => {
  const input = await admitted();
  let failures = 0;
  h.runtime.onTerminal = async (db, hookInput) => {
    if (failures < 4) {
      failures++;
      throw new Error("Synthetic delivery failure");
    }
    return deliverModelPlaygroundTerminalReport(db, hookInput);
  };
  await executeModelPlayground(h.runtime, input);
  for (let attempt = 0; attempt < 3; attempt++) {
    await due(input.runId);
    await finalizeModelPlaygroundExecution(h.runtime, input);
  }
  const before = await row(input.runId);
  expect(before.terminalHookAttempts).toBe(4);
  expect(before.terminalHookAttemptBase).toBe(0);
  await h.sql.query(`UPDATE projects SET "writeMode"='migration_hold' WHERE id=$1`, [
    input.projectId,
  ]);
  await due(input.runId);
  await finalizeModelPlaygroundExecution(h.runtime, input);
  const held = await row(input.runId);
  expect(held.terminalHookAttempts).toBe(5);
  expect(held.terminalHookAttemptBase).toBe(before.terminalHookAttemptBase + 1);
  expect(held.terminalHookDeliveredRevision).toBeLessThan(held.terminalRevision);
  expect(held.terminalHookNextAt).not.toBeNull();
});

async function expectAcknowledgedWithoutReport(runId: string, reportState?: string) {
  if (reportState) expect((await row(runId)).reportState).toBe(reportState);
  const before = await reports();
  await h.sql.query(
    `UPDATE model_playground_runs SET "terminalRevision"="terminalRevision"+1,"terminalHookNextAt"=NULL WHERE id=$1`,
    [runId],
  );
  await finalizeModelPlaygroundExecution(h.runtime, { projectId: h.context.projectId, runId });
  const acked = await row(runId);
  expect(acked.terminalHookDeliveredRevision).toBe(acked.terminalRevision);
  expect(await reports()).toBe(before);
  if (reportState) expect(acked.reportState).toBe(reportState);
}

test("a dismissed run acknowledges the revision and writes no report", async () => {
  const input = await admitted();
  await executeModelPlayground(h.runtime, input);
  h.runtime.onTerminal = deliverModelPlaygroundTerminalReport;
  await finalizeModelPlaygroundExecution(h.runtime, input);
  await h.sql.query(
    `DELETE FROM agent_reports WHERE id=(SELECT "reportId" FROM model_playground_runs WHERE id=$1)`,
    [input.runId],
  );
  await expectAcknowledgedWithoutReport(input.runId);
});

test("an unclassified run acknowledges the revision and writes no report", async () => {
  const input = await admitted();
  await executeModelPlayground(h.runtime, input);
  await h.sql.query(
    `UPDATE model_playground_runs SET "reportState"='unclassified' WHERE id=$1 AND "reportId" IS NULL`,
    [input.runId],
  );
  h.runtime.onTerminal = deliverModelPlaygroundTerminalReport;
  await expectAcknowledgedWithoutReport(input.runId, "unclassified");
});
