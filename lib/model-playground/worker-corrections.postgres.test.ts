import * as dispatch from "@/lib/provider-usage/model-dispatch";
import { beforeModelDispatch, ModelDispatchRefusal } from "@/lib/provider-usage/model-dispatch";
import {
  dispatchModelPlaygroundIntents,
  hasPendingModelPlaygroundIntent,
} from "@/lib/worker-intents/model-playground";
import { afterEach, expect, test, vi } from "vitest";
import { migrationSql } from "./admission.postgres.test-support";
import { readModelAttempts } from "./admission-storage";
import { executeModelPlayground } from "./execute";
import { claimModelDispatch } from "./execution-storage";
import { launchHarness } from "./launch.test-support";
import {
  prepareModelConnections,
  previewModelPlayground,
  resolveModelPaymentContext,
} from "./preview";
import { finalizeModelPlaygroundExecution } from "./recovery";
import * as observed from "./store-observed";
import { executeModelPlaygroundRun } from "./worker";
import { modelPlaygroundWorkerRuntime } from "./worker-runtime";

const h = launchHarness();
afterEach(() => vi.restoreAllMocks());
async function admitted() {
  const quote = await previewModelPlayground(h.runtime, { revision: "test", input: h.input });
  const run = await h.admitOnly(quote);
  const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, quote.previewId));
  return { projectId: h.context.projectId, runId: run.id, attempts };
}
async function fence(input: Awaited<ReturnType<typeof admitted>>) {
  const access = await h.runtime.authorize("create");
  const connections = await prepareModelConnections(h.runtime, access, h.input);
  const attempt = input.attempts[0];
  await claimModelDispatch(
    h.runtime.db,
    { projectId: input.projectId, runId: input.runId, columnId: attempt.rootColumnId },
    attempt.id,
    (db) =>
      beforeModelDispatch(
        db,
        {
          now: h.runtime.now,
          readCurrent: (tx, quote) =>
            resolveModelPaymentContext(
              h.runtime,
              tx,
              access,
              quote.context.input,
              connections,
              quote,
              attempt.id,
            ),
        },
        attempt.id,
      ),
  );
}

test("production worker runtime shares valuation and delivers a later-wired hook for an already terminal run", async () => {
  const { modelPlaygroundRuntimeBindings } = await import("./runtime-factory");
  const priced = h.context.columns[0];
  const valuation = vi.fn(() => ({
    forecast: priced.forecast,
    advisory: priced.advisory,
    policy: priced.binding.policy,
    rateCard: priced.binding.rateCard,
  }));
  modelPlaygroundRuntimeBindings.valuation = valuation;
  h.runtime.valuation = valuation;
  try {
    const input = await admitted();
    const runtime = modelPlaygroundWorkerRuntime(h.runtime.db, input);
    runtime.resolve = h.runtime.resolve;
    expect(runtime.valuation).toBe(valuation);
    expect(await executeModelPlaygroundRun(runtime, input)).toEqual({ terminal: true });
    const hook = vi.fn<
      NonNullable<import("./runtime-contract").ModelPlaygroundRuntime["onTerminal"]>
    >(async (_db, { revision }) => ({ revision }));
    modelPlaygroundRuntimeBindings.onTerminal = hook;
    await dispatchModelPlaygroundIntents(h.runtime.db, async () => {
      throw new Error("Already terminal");
    });
    expect(hook).toHaveBeenCalledTimes(1);
    await executeModelPlaygroundRun(runtime, input);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(h.calls).toHaveLength(1);
  } finally {
    delete modelPlaygroundRuntimeBindings.onTerminal;
    delete modelPlaygroundRuntimeBindings.valuation;
  }
});

test("permanent terminal hook failure marks terminal independently and respects SQL backoff", async () => {
  const input = await admitted();
  h.runtime.onTerminal = vi.fn(async () => {
    throw new Error("Poison hook");
  });
  const answers = await executeModelPlayground(h.runtime, input);
  expect(answers[0].result?.answer).toBeTruthy();
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(h.runtime.onTerminal).toHaveBeenCalledTimes(1);
  const row = (
    await h.sql.query<{ terminalAt: Date | null }>('SELECT "terminalAt" FROM model_playground_runs')
  ).rows[0];
  expect(row.terminalAt).not.toBeNull();
  expect(h.calls).toHaveLength(1);
});

test("a poison observed column cannot block observed siblings and durable give-up stops polling", async () => {
  h.input.columns.push({ ...structuredClone(h.input.columns[0]), columnId: crypto.randomUUID() });
  const input = await admitted();
  const save = observed.completeObservedModelColumn;
  const mock = vi
    .spyOn(observed, "completeObservedModelColumn")
    .mockRejectedValue(new Error("Retention unavailable"));
  await executeModelPlaygroundRun(h.runtime, input);
  mock.mockImplementation(async (db, identity, result) => {
    if ((identity as { columnId: string }).columnId === h.input.columns[0].columnId)
      throw new Error("Poison column");
    return save(db, identity, result);
  });
  expect(await executeModelPlaygroundRun(h.runtime, input)).toMatchObject({ terminal: false });
  const columns = (
    await h.sql.query<{ columnId: string; state: string }>(
      'SELECT "columnId",state FROM model_playground_columns',
    )
  ).rows;
  expect(columns.find((c) => c.columnId === h.input.columns[1].columnId)?.state).toBe("completed");
  await h.sql.exec('UPDATE model_playground_runs SET "workerRecoveryAttempts"=100');
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({
    terminal: false,
    stopped: true,
  });
  expect(
    (
      await h.sql.query<{ stopped: boolean }>(
        'SELECT "recoveryStoppedAt" IS NOT NULL AS stopped FROM model_playground_runs',
      )
    ).rows[0].stopped,
  ).toBe(true);
  expect(h.calls).toHaveLength(2);
});

test("SQL time prevents an ahead process clock from expiring a live paid fence", async () => {
  const input = await admitted();
  await fence(input);
  h.now.setTime(+h.now + 600_000);
  await h.sql.exec("SET TIME ZONE 'Pacific/Honolulu'");
  expect(await executeModelPlaygroundRun(h.runtime, input)).toMatchObject({ terminal: false });
  expect(
    (await h.sql.query<{ state: string }>("SELECT state FROM model_playground_columns")).rows[0]
      .state,
  ).toBe("claimed");
  expect(h.calls).toHaveLength(0);
  await h.ageDispatches();
  await h.sql.exec(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC') - INTERVAL '1 second'`,
  );
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  const [clock] = (
    await h.sql.query<{ utc: boolean }>(
      `SELECT ABS(EXTRACT(EPOCH FROM ("finishedAt"-(clock_timestamp() AT TIME ZONE 'UTC'))))<60 AS utc FROM model_playground_columns`,
    )
  ).rows;
  expect(clock.utc).toBe(true);
});

test("worker in-process deadline yields pending custody and can execute in a later activity", async () => {
  const input = await admitted();
  const wall = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(wall);
  vi.spyOn(dispatch, "beforeModelDispatch").mockImplementationOnce(async () => {
    throw new ModelDispatchRefusal("account_concurrency");
  });
  h.runtime.wait = async () => {
    clock.mockReturnValue(wall + 200_000);
  };
  expect(await executeModelPlaygroundRun(h.runtime, input)).toMatchObject({ terminal: false });
  expect(
    (await h.sql.query<{ state: string }>("SELECT state FROM model_playground_columns")).rows[0]
      .state,
  ).toBe("queued");
  clock.mockRestore();
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(h.calls).toHaveLength(1);
});

test("migration backfills terminal pre-worker runs and recognizes an already saved report", async () => {
  const input = await admitted();
  await executeModelPlaygroundRun(h.runtime, input);
  await h.sql.exec(`INSERT INTO agent_reports VALUES ('saved','${h.context.projectId}'); UPDATE model_playground_runs SET "reportId"='saved'; SET CONSTRAINTS ALL IMMEDIATE;
    DROP TRIGGER model_playground_delivery_guard ON model_playground_runs;
    DROP FUNCTION guard_model_playground_delivery();
    ALTER TABLE model_playground_runs DROP COLUMN "workerRequestedAt", DROP COLUMN "workerProbeAt", DROP COLUMN "terminalAt",
    DROP COLUMN IF EXISTS "terminalRevision", DROP COLUMN IF EXISTS "terminalHookDeliveredRevision",
    DROP COLUMN IF EXISTS "terminalHookAttemptAt", DROP COLUMN IF EXISTS "terminalHookNextAt",
    DROP COLUMN IF EXISTS "terminalHookAttempts", DROP COLUMN IF EXISTS "terminalHookAttemptBase",
    DROP COLUMN IF EXISTS "terminalHookStoppedAt", DROP COLUMN IF EXISTS "terminalHookStoppedRevision",
    DROP COLUMN IF EXISTS "terminalHookAttemptRevision",
    DROP COLUMN IF EXISTS "workerRecoveryAttempts", DROP COLUMN IF EXISTS "recoveryStoppedAt"`);
  // Only the pre-worker schema existed when the run was originally reported.
  await h.sql.exec(await migrationSql("20261113200000_model_playground_worker_delivery"));
  const hook = vi.fn<
    NonNullable<import("./runtime-contract").ModelPlaygroundRuntime["onTerminal"]>
  >(async (_db, { revision }) => ({ revision }));
  h.runtime.onTerminal = hook;
  expect(await finalizeModelPlaygroundExecution(h.runtime, input)).toBe(true);
  expect(hook).not.toHaveBeenCalled();
  expect(
    (
      await h.sql.query<{ terminal: boolean }>(
        'SELECT "terminalAt" IS NOT NULL AS terminal FROM model_playground_runs',
      )
    ).rows[0].terminal,
  ).toBe(true);
});

test("stopped run refuses queued columns and recovery-only sweep expires fenced columns to terminal", async () => {
  h.input.columns.push({ ...structuredClone(h.input.columns[0]), columnId: crypto.randomUUID() });
  const input = await admitted();
  await fence(input);
  await h.sql.exec(
    'UPDATE model_playground_runs SET "workerRecoveryAttempts"=100,"workerRequestedAt"=(clock_timestamp() AT TIME ZONE \'UTC\'),"workerProbeAt"=(clock_timestamp() AT TIME ZONE \'UTC\')',
  );
  expect(await executeModelPlaygroundRun(h.runtime, input)).toMatchObject({ stopped: true });
  const attempts = await h.runtime.db.$transaction((tx) =>
    readModelAttempts(tx, input.attempts[0].quoteId),
  );
  expect(attempts.find((a) => !a.dispatched)).toMatchObject({
    refusalReason: "reservation_unavailable",
    reservationState: "released",
  });
  expect(await hasPendingModelPlaygroundIntent(h.runtime.db)).toBe(true);
  const start = vi.fn(async () => {
    throw new Error("Stopped work must never execute");
  });
  await h.ageDispatches();
  await h.sql.exec(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC') - INTERVAL '1 second'
     WHERE state='claimed' AND "dispatchStartedAt" IS NOT NULL`,
  );
  await dispatchModelPlaygroundIntents(h.runtime.db, start);
  expect(start).not.toHaveBeenCalled();
  expect(await hasPendingModelPlaygroundIntent(h.runtime.db)).toBe(false);
  expect(
    (
      await h.sql.query<{ terminal: boolean }>(
        'SELECT "terminalAt" IS NOT NULL AS terminal FROM model_playground_runs',
      )
    ).rows[0].terminal,
  ).toBe(true);
  expect(
    (
      await h.sql.query<{ state: string }>(
        "SELECT state FROM model_playground_columns ORDER BY state",
      )
    ).rows.map((c) => c.state),
  ).toEqual(["cancelled", "unknown"]);
  expect(h.calls).toHaveLength(0);
});

test("refusal and receipt persisted times ignore a skewed host in a non-UTC SQL session", async () => {
  const input = await admitted();
  h.block();
  h.now.setTime(+h.now + 600_000);
  await h.sql.exec("SET TIME ZONE 'Pacific/Honolulu'");
  const [refused] = await executeModelPlayground(h.runtime, input);
  const sqlNow = (await h.sql.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0].now;
  expect(Math.abs(Date.parse(refused.result?.finishedAt ?? "") - +sqlNow)).toBeLessThan(60_000);
  expect(h.calls).toHaveLength(0);
});

test("receipt observation and meter event clocks use SQL time after paid dispatch despite host skew", async () => {
  const input = await admitted();
  h.pause(async () => {
    h.now.setTime(+h.now + 600_000);
  });
  await h.sql.exec("SET TIME ZONE 'Pacific/Honolulu'");
  expect((await executeModelPlayground(h.runtime, input))[0].result?.answer).toBeTruthy();
  const row = (
    await h.sql.query<{ fresh: boolean }>(`SELECT
    abs(extract(epoch FROM (a.observed_at-clock_timestamp())))<60 AND
    abs(extract(epoch FROM (o.created_at-clock_timestamp())))<60 AND
    (SELECT bool_and(abs(extract(epoch FROM (updated_at-clock_timestamp())))<60) FROM metering_operation) AS fresh
    FROM model_playground_payment_attempts a JOIN model_playground_payment_observations o ON o.attempt_id=a.id`)
  ).rows[0];
  expect(row.fresh).toBe(true);
  expect(h.calls).toHaveLength(1);
});
