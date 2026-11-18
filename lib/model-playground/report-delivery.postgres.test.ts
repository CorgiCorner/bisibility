import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { readModelAttempts } from "./admission-storage";
import { executeModelPlayground } from "./execute";
import { launchHarness } from "./launch.test-support";
import { withoutFixtureTrigger } from "./launch-database.test-support";
import { previewModelPlayground } from "./preview";
import { deliverModelPlaygroundTerminalReport } from "./report-terminal";
import { finalizeModelPlaygroundExecution } from "./terminal";

vi.mock("./report-context", () => ({ loadModelReportEntities: async () => [] }));

const h = launchHarness();
beforeEach(async () => {
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

const reportCount = async () =>
  Number(
    (await h.sql.query<{ n: string }>("SELECT count(*)::text AS n FROM agent_reports")).rows[0].n,
  );

async function hookRow(runId: string) {
  const [row] = (
    await h.sql.query<{
      terminalRevision: number;
      terminalHookDeliveredRevision: number;
      terminalHookAttempts: number;
      terminalHookAttemptBase: number;
      terminalHookNextAt: Date | null;
      answer: string | null;
    }>(
      `SELECT r."terminalRevision",r."terminalHookDeliveredRevision",r."terminalHookAttempts",r."terminalHookAttemptBase",r."terminalHookNextAt",
        c.result->>'answer' AS answer
       FROM model_playground_runs r JOIN model_playground_columns c ON c."runId"=r.id WHERE r.id=$1`,
      [runId],
    )
  ).rows;
  return row;
}

async function reportAnswer(runId: string) {
  const [row] = (
    await h.sql.query<{ answer: string | null }>(
      `SELECT body->'results'->0->>'answer' AS answer FROM agent_reports a
       JOIN model_playground_runs r ON r."reportId"=a.id WHERE r.id=$1`,
      [runId],
    )
  ).rows;
  return row?.answer ?? null;
}

test("a terminal run saves one report and a second delivery does not write again", async () => {
  const input = await admitted();
  h.runtime.onTerminal = deliverModelPlaygroundTerminalReport;
  expect((await executeModelPlayground(h.runtime, input))[0].result?.answer).toBeTruthy();
  const saved = await hookRow(input.runId);
  expect(await reportCount()).toBe(1);
  expect(await reportAnswer(input.runId)).toBe(saved.answer);
  expect(saved.terminalHookDeliveredRevision).toBe(saved.terminalRevision);
  await finalizeModelPlaygroundExecution(h.runtime, input);
  expect(await reportCount()).toBe(1);
  expect((await hookRow(input.runId)).terminalHookAttempts).toBe(saved.terminalHookAttempts);
});

test("a late paid answer bumps the revision and refreshes the saved report once", async () => {
  const input = await admitted();
  h.runtime.onTerminal = deliverModelPlaygroundTerminalReport;
  await executeModelPlayground(h.runtime, input);
  await h.sql.exec(`CREATE TABLE report_writes(n int);
    INSERT INTO report_writes VALUES(0);
    CREATE FUNCTION count_report_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN UPDATE report_writes SET n=n+1; RETURN NEW; END $$;
    CREATE TRIGGER count_report_write BEFORE UPDATE ON agent_reports
      FOR EACH ROW EXECUTE FUNCTION count_report_write()`);
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
    `UPDATE model_playground_runs SET "terminalRevision"="terminalRevision"+1,"terminalHookNextAt"=NULL
     WHERE id=$1 AND "terminalAt" IS NOT NULL`,
    [input.runId],
  );
  await finalizeModelPlaygroundExecution(h.runtime, input);
  const row = await hookRow(input.runId);
  expect(row.answer).toBe("Later paid answer");
  expect(await reportAnswer(input.runId)).toBe("Later paid answer");
  expect(await reportCount()).toBe(1);
  expect(row.terminalHookDeliveredRevision).toBe(row.terminalRevision);
  expect(Number((await h.sql.query<{ n: number }>("SELECT n FROM report_writes")).rows[0].n)).toBe(
    1,
  );
  await finalizeModelPlaygroundExecution(h.runtime, input);
  expect(Number((await h.sql.query<{ n: number }>("SELECT n FROM report_writes")).rows[0].n)).toBe(
    1,
  );
});

test("a held project returns held, writes nothing, and does not burn delivery", async () => {
  const input = await admitted();
  expect((await executeModelPlayground(h.runtime, input))[0].result?.answer).toBeTruthy();
  expect(await reportCount()).toBe(0);
  await h.sql.query(`UPDATE projects SET "writeMode"='migration_hold' WHERE id=$1`, [
    input.projectId,
  ]);
  let seen: { held: true } | { revision: number } | undefined;
  h.runtime.onTerminal = async (db, hookInput) => {
    seen = await deliverModelPlaygroundTerminalReport(db, hookInput);
    return seen;
  };
  await finalizeModelPlaygroundExecution(h.runtime, input);
  const held = await hookRow(input.runId);
  expect(seen).toEqual({ held: true });
  expect(await reportCount()).toBe(0);
  expect(held.terminalHookAttempts - held.terminalHookAttemptBase).toBe(0);
  expect(held.terminalHookNextAt).not.toBeNull();
  expect(held.terminalHookDeliveredRevision).toBeLessThan(held.terminalRevision);
  await h.sql.query(`UPDATE projects SET "writeMode"='active' WHERE id=$1`, [input.projectId]);
  await h.sql.query(
    `UPDATE model_playground_runs SET "terminalHookNextAt"=clock_timestamp()-INTERVAL '1 second' WHERE id=$1`,
    [input.runId],
  );
  await finalizeModelPlaygroundExecution(h.runtime, input);
  const delivered = await hookRow(input.runId);
  expect(seen).toEqual({ revision: delivered.terminalRevision });
  expect(await reportCount()).toBe(1);
  expect(await reportAnswer(input.runId)).toBe(delivered.answer);
  expect(delivered.terminalHookDeliveredRevision).toBe(delivered.terminalRevision);
});

test("a report that is not ready fails the claim and writes nothing", async () => {
  const input = await admitted();
  await withoutFixtureTrigger(
    h.sql,
    "model_playground_columns",
    "model_playground_column_integrity",
    async () => {
      await h.sql.query(
        `UPDATE model_playground_columns SET state='unknown',result=NULL,"finishedAt"=(clock_timestamp() AT TIME ZONE 'UTC'),"dispatchStartedAt"=(clock_timestamp() AT TIME ZONE 'UTC') WHERE "runId"=$1`,
        [input.runId],
      );
    },
  );
  h.runtime.onTerminal = deliverModelPlaygroundTerminalReport;
  await finalizeModelPlaygroundExecution(h.runtime, input);
  const row = await hookRow(input.runId);
  expect(row.terminalHookAttempts).toBe(1);
  expect(row.terminalHookNextAt).not.toBeNull();
  expect(row.terminalHookDeliveredRevision).toBeLessThan(row.terminalRevision);
  expect(await reportCount()).toBe(0);
});
