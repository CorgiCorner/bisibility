import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Context } from "@temporalio/activity";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { bundleWorkflowCode, Worker } from "@temporalio/worker";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { launchHarness } from "../model-playground/launch.test-support";
import { previewModelPlayground } from "../model-playground/preview";
import { executeModelPlaygroundRun } from "../model-playground/worker";

const enabled = process.env.MODEL_PLAYGROUND_TEMPORAL_TEST === "1";
const h = enabled ? launchHarness() : null;

describe.runIf(enabled)("Model Playground owned Temporal recovery", () => {
  let temporal: TestWorkflowEnvironment;
  let workflowBundle: Awaited<ReturnType<typeof bundleWorkflowCode>>;
  const workers: Worker[] = [];
  const running: Promise<void>[] = [];
  beforeEach(() => {
    vi.useRealTimers();
    h?.now.setTime(Date.now());
  });
  beforeAll(async () => {
    vi.useRealTimers();
    temporal = await TestWorkflowEnvironment.createLocal({
      server: {
        ip: "127.0.0.1",
        ui: false,
        ...(process.env.MODEL_PLAYGROUND_TEMPORAL_CLI
          ? {
              executable: {
                type: "existing-path" as const,
                path: process.env.MODEL_PLAYGROUND_TEMPORAL_CLI,
              },
            }
          : {}),
      },
    });
    workflowBundle = await bundleWorkflowCode({
      workflowsPath: resolve(process.cwd(), "lib/temporal/model-playground-workflow.ts"),
    });
  }, 120_000);
  afterAll(async () => {
    for (const worker of workers) if (worker.getState() === "RUNNING") worker.shutdown();
    await Promise.allSettled(running);
    await temporal?.teardown();
    expect(workers.every((w) => w.getState() === "STOPPED")).toBe(true);
  }, 60_000);

  async function fixture() {
    if (!h) throw new Error("Fixture disabled");
    const quote = await previewModelPlayground(h.runtime, { revision: "test", input: h.input });
    const run = await h.admitOnly(quote);
    const input = { projectId: h.context.projectId, runId: run.id };
    const taskQueue = `playground-test-${randomUUID()}`;
    const workflowId = `model-playground:${run.id}`;
    const options = {
      connection: temporal.nativeConnection,
      namespace: temporal.namespace,
      taskQueue,
      workflowBundle,
      shutdownGraceTime: "5 seconds",
      shutdownForceTime: "10 seconds",
    };
    return { input, taskQueue, workflowId, options };
  }

  it("duplicate workflow and retried activity after lost completion do not dispatch twice", async () => {
    if (!h) throw new Error("Fixture disabled");
    const f = await fixture();
    const finalize = vi.fn<
      NonNullable<
        import("../model-playground/runtime-contract").ModelPlaygroundRuntime["onTerminal"]
      >
    >(async (_db, { revision }) => ({ revision }));
    h.runtime.onTerminal = finalize;
    let activityCalls = 0,
      entered!: () => void,
      release!: () => void;
    const started = new Promise<void>((done) => {
      entered = done;
    });
    const pending = new Promise<void>((done) => {
      release = done;
    });
    const worker = await Worker.create({
      ...f.options,
      activities: {
        executeModelPlaygroundActivity: async () => {
          activityCalls++;
          if (activityCalls === 1) {
            entered();
            await pending;
          }
          const progress = await executeModelPlaygroundRun(h.runtime, f.input);
          if (activityCalls === 1) throw new Error("Lost activity completion");
          return progress;
        },
      },
    });
    workers.push(worker);
    await worker.runUntil(async () => {
      const options = { taskQueue: f.taskQueue, workflowId: f.workflowId, args: [f.input] };
      const handle = await temporal.client.workflow.start("modelPlaygroundWorkflow", options);
      try {
        await started;
        await expect(
          temporal.client.workflow.start("modelPlaygroundWorkflow", options),
        ).rejects.toBeInstanceOf(WorkflowExecutionAlreadyStartedError);
      } finally {
        release();
      }
      await handle.result();
      const history = await handle.fetchHistory();
      await Worker.runReplayHistory({ workflowBundle }, history);
    });
    expect(activityCalls).toBe(2);
    expect(h.calls).toHaveLength(1);
    expect(finalize).toHaveBeenCalledTimes(1);
  }, 120_000);

  it("worker shutdown with response in flight retains answer across replacement", async () => {
    if (!h) throw new Error("Fixture disabled");
    const f = await fixture();
    const finalize = vi.fn<
      NonNullable<
        import("../model-playground/runtime-contract").ModelPlaygroundRuntime["onTerminal"]
      >
    >(async (_db, { revision }) => ({ revision }));
    h.runtime.onTerminal = finalize;
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((done) => {
      entered = done;
    });
    const pending = new Promise<void>((done) => {
      release = done;
    });
    h.pause(async () => {
      entered();
      await pending;
    });
    let paid: ReturnType<typeof executeModelPlaygroundRun> | undefined;
    let deliveries = 0;
    let cancelled!: () => void;
    const cancellation = new Promise<void>((done) => {
      cancelled = done;
    });
    const options = {
      ...f.options,
      shutdownGraceTime: "100 milliseconds",
      activities: {
        executeModelPlaygroundActivity: () => {
          if (++deliveries !== 1) return executeModelPlaygroundRun(h.runtime, f.input);
          paid = executeModelPlaygroundRun(h.runtime, f.input);
          const abort = Context.current().cancelled.catch((error: unknown) => {
            cancelled();
            throw error;
          });
          return Promise.race([paid, abort]);
        },
      },
    };
    const first = await Worker.create(options);
    workers.push(first);
    const old = first.run();
    running.push(old);
    const handle = await temporal.client.workflow.start("modelPlaygroundWorkflow", {
      taskQueue: f.taskQueue,
      workflowId: f.workflowId,
      args: [f.input],
    });
    try {
      await started;
      const shutdownAt = Date.now();
      first.shutdown();
      // Cancellation is issued only after the grace period; paid transport remains held.
      await cancellation;
      expect(Date.now() - shutdownAt).toBeGreaterThanOrEqual(100);
      expect(h.calls).toHaveLength(1);
      await old;
      await h.ageDispatches();
      // The replaced process is gone, so its lease is treated as ended.
      await h.expireLeases();
      const replacement = await Worker.create(options);
      workers.push(replacement);
      await replacement.runUntil(() => handle.result());
      expect(deliveries).toBeGreaterThan(1);
      expect(
        (await h.sql.query<{ state: string }>("SELECT state FROM model_playground_columns")).rows[0]
          .state,
      ).toBe("unknown");
      expect(finalize).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await paid;
    }
    expect(h.calls).toHaveLength(1);
    expect(finalize).toHaveBeenCalledTimes(2);
    expect(
      (await h.sql.query<{ state: string }>("SELECT state FROM model_playground_columns")).rows[0]
        .state,
    ).toBe("completed");
    expect(await executeModelPlaygroundRun(h.runtime, f.input)).toEqual({ terminal: true });
  }, 120_000);

  it("a fenced crash persists its workflow timer and ages unknown without another dispatch", async () => {
    if (!h) throw new Error("Fixture disabled");
    const f = await fixture();
    const finalize = vi.fn<
      NonNullable<
        import("../model-playground/runtime-contract").ModelPlaygroundRuntime["onTerminal"]
      >
    >(async (_db, { revision }) => ({ revision }));
    h.runtime.onTerminal = finalize;
    h.pause(async () => {
      throw new Error("Process lost after paid dispatch");
    });
    let activityCalls = 0;
    const worker = await Worker.create({
      ...f.options,
      activities: {
        executeModelPlaygroundActivity: async () => {
          if (++activityCalls === 2) {
            await h.ageDispatches();
            await h.expireLeases();
          }
          return executeModelPlaygroundRun(h.runtime, f.input);
        },
      },
    });
    workers.push(worker);
    await worker.runUntil(async () => {
      const handle = await temporal.client.workflow.start("modelPlaygroundWorkflow", {
        taskQueue: f.taskQueue,
        workflowId: f.workflowId,
        args: [f.input],
      });
      await handle.result();
      const history = await handle.fetchHistory();
      expect(history.events?.some((event) => event.timerStartedEventAttributes)).toBe(true);
      await Worker.runReplayHistory({ workflowBundle }, history);
    });
    expect(activityCalls).toBe(2);
    expect(h.calls).toHaveLength(1);
    expect(
      (await h.sql.query<{ state: string }>("SELECT state FROM model_playground_columns")).rows[0]
        .state,
    ).toBe("unknown");
    expect(finalize).toHaveBeenCalledTimes(1);
  }, 120_000);
  it("recovery waits for a live fenced lease and proceeds after natural expiry", async () => {
    if (!h) throw new Error("Fixture disabled");
    const f = await fixture();
    const finalize = vi.fn(async (_db: unknown, { revision }: { revision: number }) => ({
      revision,
    }));
    h.runtime.onTerminal = finalize;
    let entered!: () => void, releasePaid!: () => void, sampled!: () => void, resume!: () => void;
    const started = new Promise<void>((done) => {
      entered = done;
    });
    const pending = new Promise<void>((done) => {
      releasePaid = done;
    });
    const recovered = new Promise<void>((done) => {
      sampled = done;
    });
    const continued = new Promise<void>((done) => {
      resume = done;
    });
    h.pause(async () => {
      entered();
      await pending;
    });
    const paid = executeModelPlaygroundRun(h.runtime, f.input);
    let activities = 0;
    let liveProgress: Awaited<ReturnType<typeof executeModelPlaygroundRun>> | undefined;
    try {
      await started;
      await h.ageDispatches();
      const readColumn = async () =>
        (
          await h.sql.query<{
            state: string;
            leaseToken: string;
            dispatchStartedAt: Date | null;
            live: boolean;
          }>(
            `SELECT state,"leaseToken","dispatchStartedAt","leaseExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC') AS live
         FROM model_playground_columns WHERE "runId"=$1`,
            [f.input.runId],
          )
        ).rows[0];
      const holder = await readColumn();
      expect(holder).toMatchObject({
        state: "claimed",
        live: true,
        leaseToken: expect.any(String),
        dispatchStartedAt: expect.any(Date),
      });
      const worker = await Worker.create({
        ...f.options,
        activities: {
          executeModelPlaygroundActivity: async () => {
            const progress = await executeModelPlaygroundRun(h.runtime, f.input);
            if (++activities === 1) {
              liveProgress = progress;
              sampled();
              await continued;
              return { ...progress, retryAfterMs: 1 };
            }
            return progress;
          },
        },
      });
      workers.push(worker);
      await worker.runUntil(async () => {
        const handle = await temporal.client.workflow.start("modelPlaygroundWorkflow", {
          taskQueue: f.taskQueue,
          workflowId: f.workflowId,
          args: [f.input],
        });
        try {
          await recovered;
          // Model: live fenced -> claimed; expired fenced -> unknown; neither can dispatch again.
          expect(liveProgress).toMatchObject({ terminal: false });
          expect(await readColumn()).toEqual(holder);
          expect(h.calls).toHaveLength(1);
          expect(finalize).not.toHaveBeenCalled();
          const [run] = (
            await h.sql.query<{ terminalAt: Date | null }>(
              `SELECT "terminalAt" FROM model_playground_runs WHERE id=$1`,
              [f.input.runId],
            )
          ).rows;
          expect(run.terminalAt).toBeNull();
          const [shortened] = (
            await h.sql.query<{ live: boolean }>(
              `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC')+INTERVAL '100 milliseconds'
             WHERE "runId"=$1 RETURNING "leaseExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC') AS live`,
              [f.input.runId],
            )
          ).rows;
          expect(shortened.live).toBe(true);
          await vi.waitFor(
            async () => {
              expect((await readColumn()).live).toBe(false);
            },
            { timeout: 10_000, interval: 100 },
          );
          expect((await readColumn()).state).toBe("claimed");
        } finally {
          resume();
        }
        await handle.result();
        expect(activities).toBe(2);
        expect((await readColumn()).state).toBe("unknown");
        expect(h.calls).toHaveLength(1);
        expect(finalize).toHaveBeenCalledTimes(1);
      });
    } finally {
      resume();
      releasePaid();
      await paid;
    }
    expect(h.calls).toHaveLength(1);
  }, 120_000);
});
