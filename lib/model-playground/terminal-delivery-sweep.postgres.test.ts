import { beforeModelDispatch } from "@/lib/provider-usage/model-dispatch";
import { afterEach, expect, test, vi } from "vitest";
import { readModelAttempts } from "./admission-storage";
import { claimModelDispatch } from "./execution-storage";
import { launchHarness } from "./launch.test-support";
import { withFixtureRestore, withoutFixtureTrigger } from "./launch-database.test-support";
import {
  prepareModelConnections,
  previewModelPlayground,
  resolveModelPaymentContext,
} from "./preview";
import { readModelPlayground } from "./read";
import { modelPlaygroundRuntimeBindings } from "./runtime-bindings";
import * as terminal from "./terminal";
import { executeModelPlaygroundRun } from "./worker";

const h = launchHarness();
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete h.runtime.onTerminal;
  delete modelPlaygroundRuntimeBindings.onTerminal;
});

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

async function column() {
  return (
    await h.sql.query<{ state: string; live: boolean }>(
      `SELECT state,"leaseExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC') AS live
       FROM model_playground_columns`,
    )
  ).rows[0];
}

test("a non-UTC session still expires a lease that was written one second ago", async () => {
  vi.stubEnv("MODEL_PLAYGROUND_WORKER_ENABLED", "0");
  const input = await admitted();
  await fence(input);
  await h.ageDispatches();
  await h.sql.transaction(async (tx) => {
    await tx.query("SET LOCAL TIME ZONE 'Asia/Tokyo'");
    expect(
      (await tx.query<{ zone: string }>("SELECT current_setting('TimeZone') AS zone")).rows[0].zone,
    ).toBe("Asia/Tokyo");
    await tx.query(
      `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC') - INTERVAL '1 second'`,
    );
  });
  const { sweepModelPlaygroundRecovery } = await import("./recovery-schedule");
  await sweepModelPlaygroundRecovery(h.runtime.db);
  expect((await column()).state).toBe("unknown");
  expect(h.calls).toHaveLength(0);
});

test("a crashed fifth claim plus a bump delivers the next revision in one call", async () => {
  const input = await admitted();
  let calls = 0;
  h.runtime.onTerminal = async () => {
    calls += 1;
    throw new Error("finalizer down");
  };
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  for (let i = 0; i < 3; i++) {
    await h.sql.exec('UPDATE model_playground_runs SET "terminalHookNextAt"=NULL');
    await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  }
  expect(calls).toBe(4);
  await h.sql.exec(`UPDATE model_playground_runs SET
    "terminalHookAttemptRevision"="terminalRevision",
    "terminalHookAttempts"="terminalHookAttempts"+1,
    "terminalRevision"="terminalRevision"+1,
    "terminalHookNextAt"=NULL`);
  h.runtime.onTerminal = async (_db, { revision }) => {
    calls += 1;
    return { revision };
  };
  await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  const [row] = (
    await h.sql.query<{ delivered: number; revision: number }>(
      `SELECT "terminalHookDeliveredRevision" AS delivered,"terminalRevision" AS revision
       FROM model_playground_runs`,
    )
  ).rows;
  expect(calls).toBe(5);
  expect(row.delivered).toBe(row.revision);
});

test("a live lease keeps the client polling and an ended lease does not", async () => {
  const input = await admitted();
  await fence(input);
  await h.ageDispatches();
  const sqlNow = (await h.sql.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0].now;
  h.now.setTime(+new Date(sqlNow) + 10_000);
  expect(await column()).toEqual({ state: "claimed", live: true });
  expect((await readModelPlayground(h.runtime, input.runId))?.progress?.[0]).toMatchObject({
    state: "stale_unknown",
    poll: true,
  });
  await h.sql.exec(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC') - INTERVAL '1 second'`,
  );
  const { sweepModelPlaygroundRecovery } = await import("./recovery-schedule");
  await sweepModelPlaygroundRecovery(h.runtime.db);
  expect(await column()).toEqual({ state: "unknown", live: false });
  expect((await readModelPlayground(h.runtime, input.runId))?.progress?.[0]).toMatchObject({
    state: "observed",
    poll: false,
  });
  expect(h.calls).toHaveLength(0);
});

test("a null lease on a fenced column can still expire", async () => {
  const input = await admitted();
  await fence(input);
  await h.ageDispatches();
  const [defined] = (
    await h.sql.query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
       WHERE c.conname='model_playground_column_state'
         AND c.conrelid='model_playground_columns'::regclass`,
    )
  ).rows;
  expect(defined?.def).toEqual(expect.any(String));
  await withFixtureRestore(
    async () => {
      await h.sql.exec(
        "ALTER TABLE model_playground_columns DROP CONSTRAINT model_playground_column_state",
      );
      await h.sql.exec('UPDATE model_playground_columns SET "leaseExpiresAt"=NULL');
      const { sweepModelPlaygroundRecovery } = await import("./recovery-schedule");
      await sweepModelPlaygroundRecovery(h.runtime.db);
      expect((await column()).state).toBe("unknown");
    },
    async () => {
      await withFixtureRestore(
        async () => {
          await withoutFixtureTrigger(
            h.sql,
            "model_playground_columns",
            "model_playground_column_integrity",
            async () => {
              await h.sql.exec(`UPDATE model_playground_columns SET "leaseExpiresAt"=COALESCE("leaseExpiresAt",(clock_timestamp() AT TIME ZONE 'UTC'))
         WHERE "leaseExpiresAt" IS NULL`);
            },
          );
        },
        () =>
          h.sql.exec(
            `ALTER TABLE model_playground_columns ADD CONSTRAINT model_playground_column_state ${defined.def}`,
          ),
      );
    },
  );
  expect(h.calls).toHaveLength(0);
});

test("the flag-off recovery sweep delivers a due terminal hook", async () => {
  vi.stubEnv("MODEL_PLAYGROUND_WORKER_ENABLED", "0");
  const input = await admitted();
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  const paid = h.calls.length;
  const hook = vi.fn(async (_db: unknown, delivery: { revision: number }) => ({
    revision: delivery.revision,
  }));
  modelPlaygroundRuntimeBindings.onTerminal = hook;
  const { sweepModelPlaygroundRecovery } = await import("./recovery-schedule");
  await sweepModelPlaygroundRecovery(h.runtime.db);
  expect(hook).toHaveBeenCalledTimes(1);
  const [row] = (
    await h.sql.query<{ delivered: number; revision: number }>(
      `SELECT "terminalHookDeliveredRevision" AS delivered,"terminalRevision" AS revision
       FROM model_playground_runs`,
    )
  ).rows;
  expect(row.delivered).toBe(row.revision);
  expect(h.calls).toHaveLength(paid);
});
