import type { PrismaClient } from "@/lib/generated/prisma/client";
import { recordModelDispatchEvidence } from "@/lib/provider-usage/model-accounting";
import { beforeModelDispatch } from "@/lib/provider-usage/model-dispatch";
import { Client } from "pg";
import { afterEach, expect, test, vi } from "vitest";
import type { ModelPaymentDatabase } from "./admission-storage";
import { readModelAttempts } from "./admission-storage";
import { claimModelDispatch } from "./execution-storage";
import { launchHarness } from "./launch.test-support";
import { fixtureSchema } from "./launch-database.test-support";
import {
  prepareModelConnections,
  previewModelPlayground,
  resolveModelPaymentContext,
} from "./preview";
import type { ModelPlaygroundRuntime } from "./runtime-contract";
import * as terminal from "./terminal";
import { reportedResult } from "./usage.test-support";
import { executeModelPlaygroundRun } from "./worker";

const h = launchHarness();
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete h.runtime.onTerminal;
});

async function admitted() {
  const quote = await previewModelPlayground(h.runtime, { revision: "test", input: h.input });
  const run = await h.admitOnly(quote);
  const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, quote.previewId));
  return { projectId: h.context.projectId, runId: run.id, attempts, quoteId: quote.previewId };
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

async function deliveryRow() {
  return (
    await h.sql.query<{
      terminal: boolean;
      terminalRevision: number;
      terminalHookDeliveredRevision: number;
      terminalHookStoppedRevision: number;
      stopped: boolean;
      givenUp: boolean;
    }>(`SELECT "terminalAt" IS NOT NULL AS terminal,"terminalRevision","terminalHookDeliveredRevision",
      "terminalHookStoppedRevision","terminalHookStoppedAt" IS NOT NULL AS stopped,
      ("terminalHookStoppedAt" IS NOT NULL AND "terminalHookStoppedRevision"="terminalRevision"
        AND "terminalHookDeliveredRevision"<"terminalRevision") AS "givenUp"
      FROM model_playground_runs`)
  ).rows[0];
}

test("a locked terminalize does not replace a settled receipt and the sweep finishes it", async () => {
  const input = await admitted();
  await fence(input);
  const attempt = input.attempts[0];
  const answer = {
    ...reportedResult(),
    column: { ...attempt.binding.column, columnId: attempt.rootColumnId },
    providerRequestId: attempt.id,
  };
  const real = terminal.terminalizeModelPlaygroundExecution;
  const spy = vi
    .spyOn(terminal, "terminalizeModelPlaygroundExecution")
    .mockImplementation(async (db, identity) => {
      const holder = new Client({
        connectionString: process.env.MODEL_LAUNCH_TEST_DATABASE_URL,
        options: `-c search_path=${fixtureSchema("launch_fixture")}`,
      });
      await holder.connect();
      await holder.query("BEGIN");
      await holder.query(`SELECT id FROM model_playground_runs WHERE id=$1 FOR UPDATE`, [
        identity.runId,
      ]);
      const transaction = db.$transaction.bind(db);
      try {
        const locked = {
          $transaction: (work: (tx: PrismaClient) => Promise<boolean>) =>
            transaction(async (tx) => {
              await tx.$executeRawUnsafe(`SELECT set_config('lock_timeout','250ms',true)`);
              return work(tx as PrismaClient);
            }),
        } as unknown as ModelPaymentDatabase;
        return await real(locked, identity);
      } finally {
        await holder.query("ROLLBACK");
        await holder.end();
      }
    });
  await expect(
    recordModelDispatchEvidence(h.runtime.db, attempt.id, answer),
  ).resolves.toMatchObject({ accountingStatus: "settled" });
  expect(spy).toHaveBeenCalled();
  expect((await deliveryRow()).terminal).toBe(false);
  const { sweepModelPlaygroundRecovery } = await import("./recovery-schedule");
  await sweepModelPlaygroundRecovery(h.runtime.db);
  expect((await deliveryRow()).terminal).toBe(true);
  expect(h.calls).toHaveLength(0);
});

test("five hook failures then a newer revision still delivers once", async () => {
  const input = await admitted();
  const hook = vi.fn<NonNullable<ModelPlaygroundRuntime["onTerminal"]>>(async () => {
    throw new Error("finalizer down");
  });
  h.runtime.onTerminal = hook;
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  for (let i = 0; i < 6; i++) {
    await h.sql.exec('UPDATE model_playground_runs SET "terminalHookNextAt"=NULL');
    await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  }
  expect(hook).toHaveBeenCalledTimes(5);
  expect((await deliveryRow()).stopped).toBe(true);
  hook.mockImplementation(async (_db, { revision }) => ({ revision }));
  await h.sql.exec(
    'UPDATE model_playground_runs SET "terminalRevision"="terminalRevision"+1,"terminalHookNextAt"=NULL',
  );
  await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  const row = await deliveryRow();
  expect(hook).toHaveBeenCalledTimes(6);
  expect(row.terminalHookDeliveredRevision).toBe(row.terminalRevision);
});

test("inline recovery expires a finished lease while the worker flag is off", async () => {
  vi.stubEnv("MODEL_PLAYGROUND_WORKER_ENABLED", "0");
  const input = await admitted();
  await fence(input);
  await h.ageDispatches();
  await h.sql.exec(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC') - INTERVAL '1 second'`,
  );
  const { sweepModelPlaygroundRecovery } = await import("./recovery-schedule");
  await sweepModelPlaygroundRecovery(h.runtime.db);
  expect(
    (await h.sql.query<{ state: string }>("SELECT state FROM model_playground_columns")).rows[0]
      .state,
  ).toBe("unknown");
  expect((await deliveryRow()).terminal).toBe(true);
  expect(h.calls).toHaveLength(0);
});

test("an acknowledgement that loses a revision race still advances the base", async () => {
  const input = await admitted();
  let raced = false;
  h.runtime.onTerminal = async (_db, { revision }) => {
    if (!raced) {
      raced = true;
      await h.sql.exec('UPDATE model_playground_runs SET "terminalRevision"="terminalRevision"+1');
    }
    return { revision };
  };
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  const row = await deliveryRow();
  expect(row.stopped).toBe(false);
  expect(row.terminalHookDeliveredRevision).toBe(row.terminalRevision);
  expect(h.calls).toHaveLength(1);
});

test("an exhausted budget stops again after five more failures", async () => {
  const input = await admitted();
  const hook = vi.fn<NonNullable<ModelPlaygroundRuntime["onTerminal"]>>(async () => {
    throw new Error("finalizer down");
  });
  h.runtime.onTerminal = hook;
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  for (let i = 0; i < 4; i++) {
    await h.sql.exec('UPDATE model_playground_runs SET "terminalHookNextAt"=NULL');
    await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  }
  expect(hook).toHaveBeenCalledTimes(5);
  await h.sql.exec(
    'UPDATE model_playground_runs SET "terminalRevision"="terminalRevision"+1,"terminalHookNextAt"=NULL',
  );
  for (let i = 0; i < 6; i++) {
    await h.sql.exec('UPDATE model_playground_runs SET "terminalHookNextAt"=NULL');
    await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  }
  const exhausted = await deliveryRow();
  expect(hook).toHaveBeenCalledTimes(10);
  expect(exhausted.terminalHookStoppedRevision).toBe(exhausted.terminalRevision);
  expect(exhausted.givenUp).toBe(true);
  hook.mockImplementation(async (_db, { revision }) => ({ revision }));
  await h.sql.exec(
    'UPDATE model_playground_runs SET "terminalRevision"="terminalRevision"+1,"terminalHookNextAt"=NULL',
  );
  await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  const delivered = await deliveryRow();
  expect(hook).toHaveBeenCalledTimes(11);
  expect(delivered.terminalHookDeliveredRevision).toBe(delivered.terminalRevision);
  expect(delivered.givenUp).toBe(false);
});

test("the fifth failing hook can bump the revision without giving that revision up", async () => {
  const input = await admitted();
  let calls = 0;
  h.runtime.onTerminal = async () => {
    calls += 1;
    if (calls === 5)
      await h.sql.exec('UPDATE model_playground_runs SET "terminalRevision"="terminalRevision"+1');
    throw new Error("finalizer down");
  };
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  for (let i = 0; i < 4; i++) {
    await h.sql.exec('UPDATE model_playground_runs SET "terminalHookNextAt"=NULL');
    await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  }
  expect(calls).toBe(5);
  h.runtime.onTerminal = async (_db, { revision }) => ({ revision });
  await h.sql.exec('UPDATE model_playground_runs SET "terminalHookNextAt"=NULL');
  await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  const row = await deliveryRow();
  expect(row.terminalHookDeliveredRevision).toBe(row.terminalRevision);
  expect(row.givenUp).toBe(false);
});

test("a crashed fifth claim gives up the attempted revision and still delivers the next", async () => {
  const input = await admitted();
  let releaseFifth!: () => void;
  const fifth = new Promise<void>((resolve) => {
    releaseFifth = resolve;
  });
  let sawBump!: () => void;
  const bumped = new Promise<void>((resolve) => {
    sawBump = resolve;
  });
  let calls = 0;
  h.runtime.onTerminal = async (_db, { revision }) => {
    calls += 1;
    if (calls < 5) throw new Error("finalizer down");
    if (calls === 5) {
      await h.sql.exec(
        'UPDATE model_playground_runs SET "terminalRevision"="terminalRevision"+1,"terminalHookNextAt"=NULL',
      );
      sawBump();
      await fifth;
      throw new Error("process died");
    }
    return { revision };
  };
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  for (let i = 0; i < 3; i++) {
    await h.sql.exec('UPDATE model_playground_runs SET "terminalHookNextAt"=NULL');
    await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  }
  expect(calls).toBe(4);
  await h.sql.exec('UPDATE model_playground_runs SET "terminalHookNextAt"=NULL');
  const fifthDelivery = terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  await bumped;
  await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  releaseFifth();
  await fifthDelivery;
  await h.sql.exec('UPDATE model_playground_runs SET "terminalHookNextAt"=NULL');
  await terminal.recoverModelPlaygroundTerminalHooks(h.runtime);
  const row = await deliveryRow();
  expect(calls).toBeGreaterThan(5);
  expect(row.terminalHookDeliveredRevision).toBe(row.terminalRevision);
  expect(row.givenUp).toBe(false);
});

test("a live execution lease survives an aged inline fence", async () => {
  const input = await admitted();
  await fence(input);
  await h.ageDispatches();
  const { sweepModelPlaygroundRecovery } = await import("./recovery-schedule");
  await sweepModelPlaygroundRecovery(h.runtime.db);
  expect(
    (
      await h.sql.query<{ state: string; live: boolean }>(
        `SELECT state,"leaseExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC') AS live
         FROM model_playground_columns`,
      )
    ).rows[0],
  ).toEqual({ state: "claimed", live: true });
  expect((await deliveryRow()).terminal).toBe(false);
  expect(h.calls).toHaveLength(0);
});
