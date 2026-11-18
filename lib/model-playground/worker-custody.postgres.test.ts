import * as accounting from "@/lib/provider-usage/model-accounting";
import * as dispatch from "@/lib/provider-usage/model-dispatch";
import { afterEach, expect, test, vi } from "vitest";
import { readModelAttempts } from "./admission-storage";
import { launchHarness } from "./launch.test-support";
import { previewModelPlayground } from "./preview";
import { MODEL_PLAYGROUND_LIMITS } from "./schema";
import { createModelPlaygroundStore } from "./store";
import * as observedStore from "./store-observed";
import { reportedResult } from "./usage.test-support";
import { executeModelPlaygroundRun } from "./worker";

const h = launchHarness();
afterEach(() => vi.restoreAllMocks());
async function admitted() {
  const q = await previewModelPlayground(h.runtime, { revision: "test", input: h.input });
  const run = await h.admitOnly(q);
  return { projectId: h.context.projectId, runId: run.id };
}

test("live unfenced claim waits; expired pre-fence custody is reclaimed once", async () => {
  const input = await admitted();
  const store = createModelPlaygroundStore(h.runtime.db);
  const claim = await store.claim({
    ...input,
    columnId: h.input.columns[0].columnId,
    leaseSeconds: 180,
  });
  expect(claim?.state).toBe("claimed");
  expect(
    (
      await h.sql.query<{ live: boolean }>(
        `SELECT "leaseExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC') AS live FROM model_playground_columns`,
      )
    ).rows[0].live,
  ).toBe(true);
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({
    terminal: false,
    retryAfterMs: 2_000,
  });
  expect(h.calls).toHaveLength(0);
  await h.sql.exec(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=clock_timestamp()-INTERVAL '1 second'`,
  );
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(h.calls).toHaveLength(1);
});

test("expired admission and detached connection finish refused without any paid dispatch", async () => {
  const input = await admitted();
  h.now.setTime(+h.now + 900_000);
  await h.sql.exec(`DELETE FROM provider_connections`);
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(
    (await createModelPlaygroundStore(h.runtime.db).read(input.projectId, input.runId)).columns[0],
  ).toMatchObject({ state: "cancelled", dispatchStartedAt: null, result: { failure: "refused" } });
  expect(h.calls).toHaveLength(0);
});

test("retained paid answer repairs crash before accounting acknowledgement without I/O", async () => {
  const input = await admitted();
  h.answer((answer) => ({ ...answer, ...reportedResult(), column: answer.column }));
  const record = vi
    .spyOn(accounting, "recordModelDispatchEvidence")
    .mockRejectedValue(new Error("Accounting offline"));
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(h.calls).toHaveLength(1);
  const run = await createModelPlaygroundStore(h.runtime.db).read(input.projectId, input.runId);
  const [before] = await h.runtime.db.$transaction((tx) =>
    readModelAttempts(tx, run.previewId, h.now),
  );
  expect(before.observed).toBe(false);
  expect(run.columns[0].result?.answer).toBeTruthy();
  record.mockRestore();
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  const [after] = await h.runtime.db.$transaction((tx) =>
    readModelAttempts(tx, run.previewId, h.now),
  );
  expect(after).toMatchObject({ observed: true, reservationState: "settled" });
  expect(h.calls).toHaveLength(1);
});

test("terminal storage marker is monotone and cannot bypass unfinished columns", async () => {
  const input = await admitted();
  await expect(
    h.sql.exec(`UPDATE model_playground_runs SET "terminalAt"=clock_timestamp()`),
  ).rejects.toThrow();
  await h.sql.exec(
    `UPDATE model_playground_runs SET "workerRequestedAt"=clock_timestamp(),"workerProbeAt"=clock_timestamp()`,
  );
  await expect(
    h.sql.exec(
      `UPDATE model_playground_runs SET "workerRequestedAt"="workerRequestedAt"+INTERVAL '1 second'`,
    ),
  ).rejects.toThrow("Model Playground delivery is fenced");
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  await expect(h.sql.exec(`UPDATE model_playground_runs SET "terminalAt"=NULL`)).rejects.toThrow();
  expect(h.calls).toHaveLength(1);
});

test("recovery fits an oversized original observation without replacing its paid answer with unknown", async () => {
  const input = await admitted();
  const answer = "x".repeat(MODEL_PLAYGROUND_LIMITS.answerBytes + 1024);
  h.answer((result) => ({ ...result, answer }));
  const save = vi
    .spyOn(observedStore, "completeObservedModelColumn")
    .mockRejectedValue(new Error("Crash before column retention"));
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({
    terminal: false,
    retryAfterMs: 2_000,
  });
  expect(h.calls).toHaveLength(1);
  const receipts = await h.sql.query<{ response: { answer: string } }>(
    "SELECT response FROM model_playground_payment_observations",
  );
  expect(receipts.rows[0].response.answer).toBe(answer);
  save.mockRestore();
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  const column = (await createModelPlaygroundStore(h.runtime.db).read(input.projectId, input.runId))
    .columns[0];
  expect(column.result).toMatchObject({ state: "partial", truncation: { application: true } });
  expect(column.result?.answer).toBe(answer.slice(0, MODEL_PLAYGROUND_LIMITS.answerBytes));
  expect(h.calls).toHaveLength(1);
});

test("a deleted terminal run finishes rediscovery without another provider call", async () => {
  const input = await admitted();
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  await h.sql.query(`DELETE FROM model_playground_runs WHERE id=$1`, [input.runId]);
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(h.calls).toHaveLength(1);
});

test("three columns preserve the two-call limit across simultaneous executor activities", async () => {
  for (let i = 0; i < 2; i++)
    h.input.columns.push({ ...structuredClone(h.input.columns[0]), columnId: crypto.randomUUID() });
  const input = await admitted();
  let active = 0,
    peak = 0,
    started = 0,
    release!: () => void,
    blocked!: () => void,
    third!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const refusedSlot = new Promise<void>((done) => {
    blocked = done;
  });
  const thirdStarted = new Promise<void>((done) => {
    third = done;
  });
  const mark = dispatch.beforeModelDispatch;
  vi.spyOn(dispatch, "beforeModelDispatch").mockImplementation(async (...args) => {
    try {
      return await mark(...args);
    } catch (error) {
      if (error instanceof dispatch.ModelDispatchRefusal && error.reason === "account_concurrency")
        blocked();
      throw error;
    }
  });
  h.pause(async () => {
    active++;
    started++;
    peak = Math.max(peak, active);
    if (started === 3) third();
    await held;
    active--;
  });
  h.runtime.wait = async () => new Promise((done) => setTimeout(done, 5));
  const executions = Promise.all([
    executeModelPlaygroundRun(h.runtime, input),
    executeModelPlaygroundRun(h.runtime, input),
  ]);
  try {
    await Promise.race([refusedSlot, thirdStarted]);
    expect(peak).toBe(2);
    expect(h.calls).toHaveLength(2);
  } finally {
    release();
    await executions;
  }
  expect(h.calls).toHaveLength(3);
  expect(new Set(h.calls).size).toBe(3);
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
});
