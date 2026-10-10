import { resolve } from "node:path";
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { bundleWorkflowCode, NativeConnection, Worker } from "@temporalio/worker";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { trackingTemporalFixture } from "./ai-tracking-temporal.fixture";

const enabled = process.env.AI_TRACKING_TEMPORAL_TEST === "1";
const workflowsPath = resolve(process.cwd(), "lib/temporal/ai-tracking-workflows.ts");
describe.runIf(enabled)("tracking real Temporal workflow and history replay", () => {
  let connection: Connection;
  let nativeConnection: NativeConnection;
  let client: Client;
  let namespace: string;
  let workflowBundle: Awaited<ReturnType<typeof bundleWorkflowCode>>;
  const owned = new Set<string>();
  const workers = new Set<Worker>();
  const running = new Set<Promise<void>>();
  const fixtures: ReturnType<typeof trackingTemporalFixture>[] = [];
  const histories: { workflowId: string; runId?: string; eventCount: number; sha256: string }[] =
    [];
  const sourceFiles = [
    "lib/temporal/ai-tracking.integration.test.ts",
    "lib/temporal/ai-tracking-temporal.fixture.ts",
    "lib/temporal/ai-tracking-workflows.ts",
    "lib/temporal/ai-tracking-activities.ts",
    "lib/ai-tracking/execution/sample.ts",
    "lib/ai-tracking/execution/polling.ts",
  ];
  let passed = 0;
  let startedAt: string;
  const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  const rpc = <T>(action: () => Promise<T>, timeout = 5000) =>
    connection.withDeadline(Date.now() + timeout, action);
  // The default unit setup freezes Date; real gRPC deadlines and timers require wall time.
  beforeEach(() => vi.useRealTimers());

  beforeAll(async () => {
    vi.useRealTimers();
    startedAt = new Date().toISOString();
    if (process.versions.node !== "22.23.1") throw new Error("Use the pinned Node 22.23.1 shim.");
    namespace = process.env.AI_TRACKING_TEMPORAL_TEST_NAMESPACE ?? "";
    if (!namespace || namespace === "temporal-system")
      throw new Error("Explicit existing local fixture namespace is required.");
    // Explicit loopback connections ignore production address, auth and task-queue settings.
    connection = await Connection.connect({ address: "127.0.0.1:7233" });
    nativeConnection = await NativeConnection.connect({ address: "127.0.0.1:7233" });
    await rpc(() => connection.workflowService.describeNamespace({ namespace }));
    client = new Client({ connection, namespace });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Provider I/O is forbidden in this fixture.");
      }),
    );
    workflowBundle = await bundleWorkflowCode({ workflowsPath });
  }, 60_000);
  afterAll(async () => {
    const cleanup: { workflowId: string; status: string }[] = [];
    for (const workflowId of owned) {
      const handle = client.workflow.getHandle(workflowId);
      let description = await rpc(() => handle.describe());
      if (description.status.name === "RUNNING") {
        await rpc(() => handle.terminate("Owned test fixture cleanup"));
        description = await rpc(() => handle.describe());
      }
      cleanup.push({ workflowId, status: description.status.name });
    }
    for (const worker of workers) if (worker.getState() === "RUNNING") worker.shutdown();
    await Promise.allSettled(running);
    const workerStates = [...workers].map((worker) => worker.getState());
    expect(workerStates.every((state) => state === "STOPPED")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    if (process.env.AI_TRACKING_TEMPORAL_TEST_RECEIPT) {
      const sourceSha256 = Object.fromEntries(
        await Promise.all(
          sourceFiles.map(async (file) => [
            file,
            sha256(await readFile(resolve(process.cwd(), file))),
          ]),
        ),
      );
      await writeFile(
        process.env.AI_TRACKING_TEMPORAL_TEST_RECEIPT,
        JSON.stringify(
          {
            startedAt,
            finishedAt: new Date().toISOString(),
            node: process.versions.node,
            address: "127.0.0.1:7233",
            namespace,
            passed,
            paidIo: 0,
            workflowBundleSha256: sha256(workflowBundle.code),
            sourceSha256,
            histories,
            cleanup,
            workerStates,
            fixtures: fixtures.map((fixture) => ({
              workflowId: fixture.workflowId,
              taskQueue: fixture.taskQueue,
              providerTaskId: fixture.row.providerTaskId,
              calls: fixture.calls,
            })),
            limitations: [
              "Fixture activities use in-memory retained rows and receipts.",
              "Worker replacement is not an OS process crash or DB-backed Temporal activity test.",
              "Actual PostgreSQL request-journal recovery is validated separately.",
              "Default runs skip this gate unless AI_TRACKING_TEMPORAL_TEST=1.",
            ],
          },
          null,
          2,
        ),
      );
    }
    await nativeConnection?.close();
    await connection?.close();
    vi.unstubAllGlobals();
  });
  async function workerFor(fixture: ReturnType<typeof trackingTemporalFixture>) {
    if (!fixtures.includes(fixture)) fixtures.push(fixture);
    const worker = await Worker.create({
      connection: nativeConnection,
      namespace,
      taskQueue: fixture.taskQueue,
      workflowBundle,
      activities: { collectAiTrackingRunActivity: fixture.collect },
      shutdownGraceTime: "1 second",
      shutdownForceTime: "5 seconds",
    });
    workers.add(worker);
    return worker;
  }
  async function start(fixture: ReturnType<typeof trackingTemporalFixture>, polls?: number) {
    owned.add(fixture.workflowId);
    console.info({ namespace, workflowId: fixture.workflowId, taskQueue: fixture.taskQueue });
    return rpc(
      () =>
        client.workflow.start("aiTrackingRunWorkflow", {
          workflowId: fixture.workflowId,
          taskQueue: fixture.taskQueue,
          args: [{ ...fixture.input, ...(polls === undefined ? {} : { polls }) }],
        }),
      15_000,
    );
  }
  async function waitForTimer(workflowId: string) {
    const end = Date.now() + 15_000;
    while (Date.now() < end) {
      const history = await rpc(() => client.workflow.getHandle(workflowId).fetchHistory());
      if (history.events?.some((event) => event.timerStartedEventAttributes)) return history;
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error("Fixture workflow did not persist its backoff timer.");
  }
  async function replay(workflowId: string, runId?: string) {
    const history = await rpc(() => client.workflow.getHandle(workflowId, runId).fetchHistory());
    await Worker.runReplayHistory({ workflowBundle }, history, workflowId);
    histories.push({
      workflowId,
      runId,
      eventCount: history.events?.length ?? 0,
      sha256: sha256(JSON.stringify(history)),
    });
    return history;
  }
  it("deduplicates real starts and replaces its worker before known-task GET and settlement", async () => {
    const fixture = trackingTemporalFixture();
    const first = await workerFor(fixture);
    const firstRun = first.run();
    running.add(firstRun);
    void firstRun.catch(() => undefined);
    const handle = await start(fixture);
    await waitForTimer(fixture.workflowId);
    await expect(start(fixture)).rejects.toBeInstanceOf(WorkflowExecutionAlreadyStartedError);
    expect(fixture.calls.post).toBe(1);
    expect(fixture.row.providerTaskId).toBe("fixture-purchased-task");
    first.shutdown();
    await firstRun;
    const replacement = await workerFor(fixture);
    const result = await replacement.runUntil(() => rpc(() => handle.result(), 90_000));
    expect(result).toMatchObject({ pending: 0, terminal: 1 });
    expect(fixture.calls).toMatchObject({ post: 1, get: 1, persist: 1 });
    expect(fixture.receipts.size).toBe(1);
    expect(fixture.receipts.get("fixture-ledger")).toMatchObject({
      amountUsd: "0.0032",
      state: "derived",
    });
    const before = { ...fixture.calls };
    await replay(fixture.workflowId);
    expect(fixture.calls).toEqual(before);
    passed += 1;
  }, 120_000);
  it("cancels during real sleep and collects only its purchased task under a non-cancellable scope", async () => {
    const fixture = trackingTemporalFixture();
    const worker = await workerFor(fixture);
    await worker.runUntil(async () => {
      const handle = await start(fixture);
      await waitForTimer(fixture.workflowId);
      await rpc(() => handle.cancel());
      expect(await rpc(() => handle.result(), 30_000)).toMatchObject({ pending: 0, terminal: 1 });
    });
    expect(fixture.row.cancelled).toBe(true);
    expect(fixture.calls).toMatchObject({ post: 1, get: 1, collectionOnly: 1, persist: 1 });
    const before = { ...fixture.calls };
    const history = await replay(fixture.workflowId);
    expect(
      history.events?.some((event) => event.workflowExecutionCancelRequestedEventAttributes),
    ).toBe(true);
    expect(fixture.calls).toEqual(before);
    passed += 1;
  }, 60_000);
  it("continues as new and replays both real histories without another paid submission", async () => {
    const fixture = trackingTemporalFixture();
    const worker = await workerFor(fixture);
    let firstRunId = "";
    await worker.runUntil(async () => {
      const handle = await start(fixture, 19);
      firstRunId = handle.firstExecutionRunId;
      expect(await rpc(() => handle.result(), 30_000)).toMatchObject({ pending: 0, terminal: 1 });
    });
    const latest = await rpc(() => client.workflow.getHandle(fixture.workflowId).describe());
    expect(latest.runId).not.toBe(firstRunId);
    expect(fixture.calls).toMatchObject({ post: 1, get: 1, persist: 1 });
    const before = { ...fixture.calls };
    const original = await replay(fixture.workflowId, firstRunId);
    expect(
      original.events?.some((event) => event.workflowExecutionContinuedAsNewEventAttributes),
    ).toBe(true);
    await replay(fixture.workflowId, latest.runId);
    expect(fixture.calls).toEqual(before);
    passed += 1;
  }, 60_000);
});

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
