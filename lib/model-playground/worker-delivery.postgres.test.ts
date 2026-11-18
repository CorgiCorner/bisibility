import {
  dispatchModelPlaygroundIntents,
  MODEL_PLAYGROUND_PENDING_PROBE,
  pendingModelPlaygroundRuns,
} from "@/lib/worker-intents/model-playground";
import { WORKER_INTENT_PENDING_PROBE } from "@/lib/worker-intents/pending-probe";
import { afterEach, expect, test, vi } from "vitest";
import { readModelAttempts } from "./admission-storage";
import { launchModelPlayground } from "./launch";
import { launchHarness, launchRequest } from "./launch.test-support";
import { previewModelPlayground } from "./preview";
import type { ModelRunIdentity } from "./recovery";
import { executeModelPlaygroundRun } from "./worker";
import { modelPlaygroundWorkerEnabled } from "./worker-config";
import { unrelatedIntentDdl } from "./worker-probe.test-support";

const wake = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error("Lost wake");
  }),
);
vi.mock("@/lib/worker-intents/realtime", () => ({ publishWorkerIntent: wake }));
const h = launchHarness();
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  wake.mockClear();
});
const preview = () => previewModelPlayground(h.runtime, { revision: "test", input: h.input });
const identity = (runId: string) => ({ projectId: h.context.projectId, runId });

test("lost wake-up is repaired by durable bounded pending discovery", async () => {
  await h.sql.exec(unrelatedIntentDdl);
  const pending = async () =>
    (
      await h.sql.query<{ pending: boolean }>(
        WORKER_INTENT_PENDING_PROBE.text,
        WORKER_INTENT_PENDING_PROBE.values,
      )
    ).rows[0].pending ||
    (
      await h.sql.query<{ pending: boolean }>(
        MODEL_PLAYGROUND_PENDING_PROBE.text,
        MODEL_PLAYGROUND_PENDING_PROBE.values,
      )
    ).rows[0].pending;
  expect(await pending()).toBe(false);
  vi.stubEnv("MODEL_PLAYGROUND_WORKER_ENABLED", "true");
  const q = await preview();
  const out = await launchModelPlayground(h.runtime, launchRequest(q));
  if (out.kind !== "admitted") throw new Error(out.kind);
  expect(h.calls).toHaveLength(0);
  expect(wake).toHaveBeenCalledWith("model_playground");
  expect(await pending()).toBe(true);
  const start = vi.fn(async (input: ModelRunIdentity) => {
    expect(input).toEqual(identity(out.result.runId));
    expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  });
  expect(await dispatchModelPlaygroundIntents(h.runtime.db, start)).toEqual({ started: 1 });
  expect(h.calls).toHaveLength(1);
  expect(await pending()).toBe(false);
  expect(await pendingModelPlaygroundRuns(h.runtime.db)).toEqual([]);
  expect(start).toHaveBeenCalledTimes(1);
});

test("worker delivery and admission roll back together when durable intent cannot commit", async () => {
  vi.stubEnv("MODEL_PLAYGROUND_WORKER_ENABLED", "1");
  const q = await preview();
  await h.sql.exec(`CREATE FUNCTION reject_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Synthetic delivery failure'; END $$;
    CREATE TRIGGER reject_delivery BEFORE UPDATE OF "workerRequestedAt" ON model_playground_runs
    FOR EACH ROW EXECUTE FUNCTION reject_delivery();`);
  expect((await launchModelPlayground(h.runtime, launchRequest(q))).kind).toBe("uncertain");
  expect(await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId))).toEqual([]);
  expect((await h.sql.query("SELECT id FROM model_playground_runs")).rows).toEqual([]);
  expect(h.calls).toHaveLength(0);
  expect(wake).not.toHaveBeenCalled();
  await h.sql.exec("DROP TRIGGER reject_delivery ON model_playground_runs");
  expect((await launchModelPlayground(h.runtime, launchRequest(q))).kind).toBe("admitted");
  expect(await pendingModelPlaygroundRuns(h.runtime.db)).toHaveLength(1);
});

test("failed starts remain rediscoverable and the probe rotates at most fifty runs", async () => {
  vi.stubEnv("MODEL_PLAYGROUND_WORKER_ENABLED", "1");
  const q = await preview();
  const out = await launchModelPlayground(h.runtime, launchRequest(q));
  if (out.kind !== "admitted") throw new Error(out.kind);
  // Copy valid immutable snapshots; these fixture rows are not admitted and are never executed.
  await h.sql.exec(`INSERT INTO model_playground_runs
    (id,"projectId","actorId","requestId","previewId","configHash",snapshot,"workerRequestedAt","workerProbeAt")
    SELECT gen_random_uuid()::text,r."projectId",r."actorId",gen_random_uuid()::text,r."previewId",r."configHash",r.snapshot,
      clock_timestamp(),clock_timestamp()-INTERVAL '1 second' FROM model_playground_runs r,generate_series(1,51)`);
  const fail = vi.fn(async () => {
    throw new Error("Temporal unavailable");
  });
  expect(await dispatchModelPlaygroundIntents(h.runtime.db, fail)).toEqual({ started: 0 });
  expect(fail).toHaveBeenCalledTimes(50);
  expect(await pendingModelPlaygroundRuns(h.runtime.db)).toHaveLength(2);
  expect(await pendingModelPlaygroundRuns(h.runtime.db)).toHaveLength(0);
  await h.sql.exec(
    `UPDATE model_playground_runs SET "workerProbeAt"=clock_timestamp()-INTERVAL '1 second'`,
  );
  expect(await pendingModelPlaygroundRuns(h.runtime.db)).toHaveLength(50);
  expect(h.calls).toHaveLength(0);
});

test("worker flag defaults to inline and accepts only explicit activation", async () => {
  expect(modelPlaygroundWorkerEnabled({})).toBe(false);
  for (const flag of ["false", "0", "TRUE", "garbage"])
    expect(modelPlaygroundWorkerEnabled({ MODEL_PLAYGROUND_WORKER_ENABLED: flag })).toBe(false);
  for (const flag of ["true", "1"])
    expect(modelPlaygroundWorkerEnabled({ MODEL_PLAYGROUND_WORKER_ENABLED: flag })).toBe(true);
  vi.stubEnv("MODEL_PLAYGROUND_WORKER_ENABLED", "0");
  const out = await launchModelPlayground(h.runtime, launchRequest(await preview()));
  expect(out.kind).toBe("admitted");
  expect(h.calls).toHaveLength(1);
  expect(wake).not.toHaveBeenCalled();
  expect(await pendingModelPlaygroundRuns(h.runtime.db)).toEqual([]);
});

test("missing playground tables leave the shared pending families queryable", async () => {
  await h.sql.exec(unrelatedIntentDdl);
  await h.sql.exec("DROP TABLE model_playground_runs CASCADE");
  const pending = async () =>
    (
      await h.sql.query<{ pending: boolean }>(
        WORKER_INTENT_PENDING_PROBE.text,
        WORKER_INTENT_PENDING_PROBE.values,
      )
    ).rows[0].pending;
  expect(await pending()).toBe(false);
  await h.sql.exec("INSERT INTO provider_comparison_sides VALUES ('queued')");
  expect(await pending()).toBe(true);
});
