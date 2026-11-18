import { recordModelDispatchEvidence } from "@/lib/provider-usage/model-accounting";
import { beforeModelDispatch } from "@/lib/provider-usage/model-dispatch";
import { afterEach, expect, test, vi } from "vitest";
import { MODEL_IN_FLIGHT_MS } from "./admission-state";
import { type ModelPaymentDatabase, readModelAttempts } from "./admission-storage";
import { executeModelPlayground } from "./execute";
import * as executionStorage from "./execution-storage";
import { claimModelDispatch } from "./execution-storage";
import { launchHarness } from "./launch.test-support";
import {
  prepareModelConnections,
  previewModelPlayground,
  resolveModelPaymentContext,
} from "./preview";
import { readModelPlayground } from "./read";
import { createModelPlaygroundStore } from "./store";
import { reportedResult } from "./usage.test-support";
import { executeModelPlaygroundRun } from "./worker";
import { modelPlaygroundWorkerRuntime } from "./worker-runtime";

const h = launchHarness();
afterEach(() => vi.restoreAllMocks());
async function admitted() {
  const q = await previewModelPlayground(h.runtime, { revision: "test", input: h.input });
  const run = await h.admitOnly(q);
  const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
  return { q, run, input: { projectId: h.context.projectId, runId: run.id, attempts } };
}
async function fence(input: Awaited<ReturnType<typeof admitted>>["input"], index = 0) {
  const access = await h.runtime.authorize("create");
  const connections = await prepareModelConnections(h.runtime, access, h.input);
  const attempt = input.attempts[index];
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
  return attempt;
}

test("worker crash before fence rolls back custody and recovery executes once", async () => {
  const { input } = await admitted();
  await expect(
    claimModelDispatch(
      h.runtime.db,
      { projectId: input.projectId, runId: input.runId, columnId: input.attempts[0].rootColumnId },
      input.attempts[0].id,
      async () => {
        throw new Error("Crash before commit");
      },
    ),
  ).rejects.toThrow("Crash before commit");
  expect(
    (await createModelPlaygroundStore(h.runtime.db).read(input.projectId, input.runId)).columns[0],
  ).toMatchObject({ state: "queued", dispatchStartedAt: null, leaseToken: null });
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(h.calls).toHaveLength(1);
});

test("worker crash after fence waits by age, never resends and good siblings continue", async () => {
  h.input.columns.push({ ...structuredClone(h.input.columns[0]), columnId: crypto.randomUUID() });
  const { input, q } = await admitted();
  await fence(input);
  expect(await executeModelPlaygroundRun(h.runtime, input)).toMatchObject({ terminal: false });
  expect(h.calls).toHaveLength(1);
  expect(h.calls).not.toContain(input.attempts[0].id);
  await h.ageDispatches(MODEL_IN_FLIGHT_MS - 60_000);
  expect(await executeModelPlaygroundRun(h.runtime, input)).toMatchObject({ terminal: false });
  await h.ageDispatches();
  expect(await executeModelPlaygroundRun(h.runtime, input)).toMatchObject({ terminal: false });
  await h.sql.exec(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC') - INTERVAL '1 second'
     WHERE "dispatchStartedAt" IS NOT NULL AND state='claimed'`,
  );
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(h.calls).toHaveLength(1);
  const stored = await createModelPlaygroundStore(h.runtime.db).read(input.projectId, input.runId);
  expect(stored.columns.find((c) => c.columnId === input.attempts[0].rootColumnId)?.state).toBe(
    "unknown",
  );
  const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
  expect(attempts.find((attempt) => attempt.id === input.attempts[0].id)).toMatchObject({
    state: "observed",
    observed: true,
  });
});

test("lease loss never frees a paid fence and late receipt settles after terminal unknown", async () => {
  const { input, q } = await admitted();
  const attempt = await fence(input);
  await h.sql.exec(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC') - INTERVAL '1 second'`,
  );
  expect(await executeModelPlaygroundRun(h.runtime, input)).toMatchObject({ terminal: false });
  expect(h.calls).toHaveLength(0);
  await h.ageDispatches();
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  const answer = { ...reportedResult(), column: attempt.binding.column };
  const before = (
    await h.sql.query<{ terminalAt: Date; terminalRevision: number }>(
      'SELECT "terminalAt","terminalRevision" FROM model_playground_runs',
    )
  ).rows[0];
  await recordModelDispatchEvidence(h.runtime.db, attempt.id, answer, h.now);
  const after = (
    await h.sql.query<{ terminalAt: Date; terminalRevision: number }>(
      'SELECT "terminalAt","terminalRevision" FROM model_playground_runs',
    )
  ).rows[0];
  expect(after.terminalAt).toEqual(before.terminalAt);
  expect(after.terminalRevision).toBe(before.terminalRevision + 2);
  const [observed] = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
  expect(observed).toMatchObject({ state: "observed", reservationState: "settled" });
  expect((await readModelPlayground(h.runtime, input.runId))?.columns[0].answer).toBe(
    answer.answer,
  );
  expect(
    (await createModelPlaygroundStore(h.runtime.db).read(input.projectId, input.runId)).columns[0]
      .state,
  ).toBe("completed");
  expect(h.calls).toHaveLength(0);
});

test("duplicate activity and completed column rediscovery finalize once without replay", async () => {
  const { input } = await admitted();
  const finalize = vi.fn<
    NonNullable<import("./runtime-contract").ModelPlaygroundRuntime["onTerminal"]>
  >(async (_db, { revision }) => ({ revision }));
  h.runtime.onTerminal = finalize;
  await Promise.all([
    executeModelPlaygroundRun(h.runtime, input),
    executeModelPlaygroundRun(h.runtime, input),
  ]);
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(h.calls).toHaveLength(1);
  expect(finalize).toHaveBeenCalledTimes(1);
});

test("inline and worker paths racing share the same fence and terminal hook", async () => {
  const { input } = await admitted();
  const finalize = vi.fn<
    NonNullable<import("./runtime-contract").ModelPlaygroundRuntime["onTerminal"]>
  >(async (_db, { revision }) => ({ revision }));
  h.runtime.onTerminal = finalize;
  let entered = 0,
    release!: () => void,
    both!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const ready = new Promise<void>((done) => {
    both = done;
  });
  const claim = executionStorage.claimModelDispatch;
  vi.spyOn(executionStorage, "claimModelDispatch").mockImplementation(async (...args) => {
    if (++entered === 2) both();
    await gate;
    return claim(...args);
  });
  const racing = Promise.all([
    executeModelPlayground(h.runtime, input),
    executeModelPlaygroundRun(h.runtime, input),
  ]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bounded = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Both claim contenders must arrive")), 10_000);
  });
  try {
    await Promise.race([ready, racing, bounded]);
    expect(entered).toBe(2);
    expect(h.calls).toHaveLength(0);
  } finally {
    clearTimeout(timer);
    release();
    await racing;
  }
  expect(h.calls).toHaveLength(1);
  expect(finalize).toHaveBeenCalledTimes(1);
});

test("shutdown with response in flight retains its late answer and refreshes terminal content", async () => {
  const { input } = await admitted();
  const finalize = vi.fn<
    NonNullable<import("./runtime-contract").ModelPlaygroundRuntime["onTerminal"]>
  >(async (_db, { revision }) => ({ revision }));
  h.runtime.onTerminal = finalize;
  let release!: () => void, entered!: () => void;
  const pending = new Promise<void>((done) => {
    release = done;
  });
  const paused = new Promise<void>((done) => {
    entered = done;
  });
  h.pause(async () => {
    entered();
    await pending;
  });
  const old = executeModelPlaygroundRun(h.runtime, input);
  try {
    await paused;
    await h.ageDispatches();
    expect(await executeModelPlaygroundRun(h.runtime, input)).toMatchObject({ terminal: false });
    expect(h.calls).toHaveLength(1);
  } finally {
    release();
    await old;
  }
  expect((await readModelPlayground(h.runtime, input.runId))?.columns[0].state).toBe("completed");
  expect(finalize).toHaveBeenCalledTimes(1);
  expect(h.calls).toHaveLength(1);
});

test("terminal hook failure preserves paid answer and retries its transaction without I/O", async () => {
  const { input } = await admitted();
  const finalize = vi.fn(async (db: ModelPaymentDatabase, { revision }: { revision: number }) => {
    await db.$transaction(
      (tx) =>
        tx.$executeRaw`UPDATE model_playground_runs SET "reportId"=NULL WHERE id=${input.runId}`,
    );
    if (finalize.mock.calls.length === 1) throw new Error("Supplementary report failure");
    return { revision };
  });
  h.runtime.onTerminal = finalize;
  const first = await executeModelPlayground(h.runtime, input);
  expect(first[0].result?.answer).toBeTruthy();
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(finalize).toHaveBeenCalledTimes(1);
  await h.sql.exec(
    `UPDATE model_playground_runs SET "terminalHookNextAt"=clock_timestamp()-INTERVAL '1 second'`,
  );
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(finalize).toHaveBeenCalledTimes(2);
  expect(h.calls).toHaveLength(1);
});

test("worker authorization revalidates original actor before any credential resolver", async () => {
  const { input } = await admitted();
  const runtime = modelPlaygroundWorkerRuntime(h.runtime.db, input);
  runtime.resolve = h.runtime.resolve;
  expect(await runtime.authorize("create")).toMatchObject({ actorId: h.context.actorId });
  await h.sql.exec(`DELETE FROM memberships`);
  await expect(runtime.authorize("create")).rejects.toMatchObject({ reason: "access_denied" });
  vi.mocked(h.runtime.resolve).mockClear();
  expect(await executeModelPlaygroundRun(runtime, input)).toEqual({ terminal: true });
  expect(h.runtime.resolve).not.toHaveBeenCalled();
  expect(h.calls).toHaveLength(0);
});
