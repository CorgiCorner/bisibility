import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitQueuedRankCheckBatch } from "./queued-submit";
import { cancelRankCheckRun } from "./runs/cancel";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const mocks = vi.hoisted(() => {
  const state = {
    batch: "prepared",
    origin: {
      credentialId: null as string | null,
      credentialKind: null as string | null,
      source: null as string | null,
      trigger: null as string | null,
    },
    run: "running",
    task: "prepared",
  };
  const batch = () => ({
    connection: { credentialsEncrypted: "encrypted", id: "connection_1" },
    connectionId: "connection_1",
    credentialId: state.origin.credentialId,
    credentialKind: state.origin.credentialKind,
    id: "batch_1",
    priority: "high",
    project: {
      defaults: { serpStopOnMatch: true },
      domain: "example.com",
    },
    projectId: "project_1",
    runId: "run_1",
    source: state.origin.source,
    state: state.batch,
    trigger: state.origin.trigger,
    tasks: [
      {
        id: "qtask_1",
        keywordId: "keyword_1",
        keyword: {
          device: "desktop",
          locationRef: {
            canonicalKey: "country:us",
            cityName: null,
            countryCode: "US",
            displayName: "United States",
            gl: "us",
            hl: "en",
            id: "location_1",
            kind: "country",
            languageLabel: "English",
            primaryGeoCode: 2840,
            primaryGeoName: "United States",
            regionCode: null,
            secondaryGeoName: "United States",
          },
          schedule: null,
          text: "private keyword text",
        },
        rankCheck: { requestedDepth: 100 },
      },
    ],
  });
  const prisma = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(async () => [{ status: state.run }]),
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input === "function") return input(prisma);
      return Promise.all(input as Promise<unknown>[]);
    }),
    queuedRankCheckBatch: {
      findUniqueOrThrow: vi.fn(async () => batch()),
      update: vi.fn(async ({ data }: { data: { state?: string } }) => {
        if (data.state) state.batch = data.state;
        return batch();
      }),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: { state?: string };
          where: { state: string | { in: string[] } };
        }) => {
          const matches =
            typeof where.state === "string"
              ? state.batch === where.state
              : where.state.in.includes(state.batch);
          if (!matches) return { count: 0 };
          if (data.state) state.batch = data.state;
          return { count: 1 };
        },
      ),
    },
    queuedRankCheckTask: {
      update: vi.fn(),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: { providerTag?: string; state?: string };
          where: { id?: string; state?: string | { in: string[] } };
        }) => {
          const matches =
            !where.state ||
            (typeof where.state === "string"
              ? state.task === where.state
              : where.state.in.includes(state.task));
          if (!matches) return { count: 0 };
          if (data.state) state.task = data.state;
          return { count: 1 };
        },
      ),
    },
    rankCheckRun: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    rankCheckRunItem: { updateMany: vi.fn() },
  };
  return {
    assertQueuedRankCheckBatchAllocation: vi.fn(),
    assertOperationAccess: vi.fn(),
    beginJournal: vi.fn(),
    consumeProviderLimit: vi.fn(),
    deferQueuedRankCheckBatch: vi.fn(),
    journal: { discard: vi.fn(), settle: vi.fn() },
    prisma,
    resolveProviderCredentials: vi.fn(),
    state,
    submit: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/operations/access-extension", () => ({
  assertOperationAccess: mocks.assertOperationAccess,
}));
vi.mock("./allocation-enforcement", () => ({
  assertQueuedRankCheckBatchAllocation: mocks.assertQueuedRankCheckBatchAllocation,
}));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: mocks.resolveProviderCredentials,
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: mocks.consumeProviderLimit,
  writeCooldown: vi.fn(),
}));
vi.mock("@/lib/providers/serp/dataforseo-queued", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/providers/serp/dataforseo-queued")>();
  return {
    ...original,
    submitDataForSeoQueuedTasks: mocks.submit,
  };
});
vi.mock("./queued-lifecycle", () => ({
  deferQueuedRankCheckBatch: mocks.deferQueuedRankCheckBatch,
}));
vi.mock("./queued-usage-journal", () => ({
  beginQueuedTaskUsageJournal: mocks.beginJournal,
}));

describe("queued paid-call fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "1");
    mocks.state.batch = "prepared";
    mocks.state.origin = {
      credentialId: null,
      credentialKind: null,
      source: null,
      trigger: null,
    };
    mocks.state.run = "running";
    mocks.state.task = "prepared";
    mocks.resolveProviderCredentials.mockReturnValue({
      login: "login",
      password: "password",
    });
    mocks.assertQueuedRankCheckBatchAllocation.mockResolvedValue(undefined);
    mocks.consumeProviderLimit.mockResolvedValue({
      accountKey: "dataforseo:account",
      success: true,
    });
    mocks.deferQueuedRankCheckBatch.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });
    mocks.beginJournal.mockResolvedValue(mocks.journal);
    mocks.submit.mockResolvedValue({
      accepted: [
        {
          correlationId: "qtask_1",
          costCents: 1.2,
          providerTaskId: "provider_1",
          tag: "app=bisibility;stage=dev;src=app;trg=scheduled;f=rank_check;p=project_1;c=qtask_1",
        },
      ],
      failed: [],
      unknown: [],
    });
    mocks.prisma.rankCheckRunItem.updateMany.mockResolvedValue({ count: 0 });
  });

  it("leaves an allocation preflight infrastructure failure retryable", async () => {
    const preflightFailure = new Error("allocation query unavailable");
    mocks.assertQueuedRankCheckBatchAllocation.mockRejectedValueOnce(preflightFailure);

    await expect(submitQueuedRankCheckBatch("batch_1")).rejects.toBe(preflightFailure);

    expect(mocks.state.batch).toBe("prepared");
    expect(mocks.state.task).toBe("prepared");
    expect(mocks.consumeProviderLimit).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("defers the whole batch when its allocation estimate is exhausted", async () => {
    const { ProviderAllocationExhaustedError } = await import("@/lib/provider-usage/enforcement");
    mocks.assertQueuedRankCheckBatchAllocation.mockRejectedValueOnce(
      new ProviderAllocationExhaustedError("connection_1", "app"),
    );

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "deferred" });

    expect(mocks.assertQueuedRankCheckBatchAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: expect.objectContaining({ id: "connection_1" }),
        priority: "high",
        projectId: "project_1",
        surface: "app",
        tasks: [{ depth: 100 }],
      }),
      mocks.prisma,
    );
    expect(mocks.deferQueuedRankCheckBatch).toHaveBeenCalledWith(
      "batch_1",
      "Queued provider allocation reached; deferring this batch.",
    );
    expect(mocks.consumeProviderLimit).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("posts only after durably moving the ledger to submitting", async () => {
    await submitQueuedRankCheckBatch("batch_1");

    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.consumeProviderLimit).toHaveBeenCalledOnce();
    expect(mocks.prisma.queuedRankCheckBatch.updateMany).toHaveBeenCalledWith({
      data: { state: "submitting" },
      where: { id: "batch_1", state: "prepared" },
    });
    expect(mocks.prisma.queuedRankCheckBatch.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submit.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("persists the new provider tag before an ambiguous paid submission", async () => {
    const { DataForSeoAmbiguousSubmissionError } = await import(
      "@/lib/providers/serp/dataforseo-queued"
    );
    mocks.submit.mockRejectedValueOnce(
      new DataForSeoAmbiguousSubmissionError("acceptance is unknown"),
    );

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      state: "ambiguous",
    });

    const providerTag = mocks.submit.mock.calls[0]?.[0].tasks[0]?.tag;
    const persistedTag = mocks.prisma.queuedRankCheckTask.updateMany.mock.calls.find(
      ([input]) => input.data.providerTag,
    );
    expect(providerTag).toMatch(
      /^app=bisibility;stage=dev;src=app;trg=scheduled;f=rank_check;p=project_1;c=qtask_1$/,
    );
    expect(mocks.submit.mock.calls[0]?.[0].tasks[0]?.attribution.context).toEqual({
      correlationId: "qtask_1",
      feature: "rank_check",
      projectId: "project_1",
      source: "app",
      trigger: "scheduled",
    });
    expect(mocks.submit.mock.calls[0]?.[0].tasks[0]?.attribution.credential).toBeUndefined();
    expect(persistedTag).toEqual([
      {
        data: {
          providerTag,
        },
        where: { id: "qtask_1", state: "submitting" },
      },
    ]);
    expect(
      mocks.prisma.queuedRankCheckTask.updateMany.mock.invocationCallOrder.find(
        (_: number, index: number) =>
          mocks.prisma.queuedRankCheckTask.updateMany.mock.calls[index]?.[0].data.providerTag,
      ),
    ).toBeLessThan(mocks.submit.mock.invocationCallOrder[0] ?? 0);
  });

  it("submits a run batch under its stored source, trigger and credential", async () => {
    mocks.state.origin = {
      credentialId: "key_1",
      credentialKind: "project_key",
      source: "api",
      trigger: "manual",
    };

    await submitQueuedRankCheckBatch("batch_1");

    expect(mocks.assertQueuedRankCheckBatchAllocation).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "programmatic" }),
      mocks.prisma,
    );
    expect(mocks.submit.mock.calls[0]?.[0].tasks[0]?.attribution.context).toEqual({
      correlationId: "qtask_1",
      feature: "rank_check",
      projectId: "project_1",
      source: "api",
      trigger: "manual",
    });
    expect(mocks.submit.mock.calls[0]?.[0].tasks[0]?.attribution.credential).toEqual({
      id: "key_1",
      kind: "project_key",
    });
  });

  it("blocks cutover before the lifecycle transition, limiter, and paid POST", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      state: "deferred",
    });

    expect(mocks.deferQueuedRankCheckBatch).toHaveBeenCalledWith(
      "batch_1",
      "Queued provider submission is disabled in cutover scheduler mode.",
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.consumeProviderLimit).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("begins durable unknown receipts before the paid POST and settles before persistence", async () => {
    await submitQueuedRankCheckBatch("batch_1");

    expect(mocks.beginJournal).toHaveBeenCalledWith({
      client: mocks.prisma,
      connectionId: "connection_1",
      projectId: "project_1",
      tasks: [
        expect.objectContaining({
          attribution: expect.objectContaining({
            context: {
              correlationId: "qtask_1",
              feature: "rank_check",
              projectId: "project_1",
              source: "app",
              trigger: "scheduled",
            },
          }),
          correlationId: "qtask_1",
          keywordId: "keyword_1",
        }),
      ],
    });
    expect(mocks.beginJournal.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submit.mock.invocationCallOrder[0] ?? 0,
    );
    const settled = mocks.journal.settle.mock.invocationCallOrder[0];
    const persistedAccepted = mocks.prisma.queuedRankCheckTask.updateMany.mock.calls.findIndex(
      ([input]) => input.data.state === "submitted",
    );
    expect(settled).toBeLessThan(
      mocks.prisma.queuedRankCheckTask.updateMany.mock.invocationCallOrder[persistedAccepted],
    );
    expect(mocks.journal.discard).not.toHaveBeenCalled();
  });

  it("keeps an accepted paid receipt when queue persistence fails afterwards", async () => {
    const original = mocks.prisma.queuedRankCheckTask.updateMany.getMockImplementation();
    mocks.prisma.queuedRankCheckTask.updateMany.mockImplementation(async (input) => {
      if (input.data.state === "submitted") throw new Error("queue database unavailable");
      return original ? original(input) : { count: 1 };
    });

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      state: "ambiguous",
    });

    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.journal.settle).toHaveBeenCalledOnce();
    expect(mocks.journal.discard).not.toHaveBeenCalled();
    expect(mocks.state.batch).toBe("ambiguous");
    expect(mocks.state.task).toBe("ambiguous");
  });

  it("makes no paid call when the durable pending receipt cannot persist", async () => {
    const { ProviderUsagePersistenceError } = await import("@/lib/providers/usage");
    mocks.beginJournal.mockRejectedValueOnce(
      new ProviderUsagePersistenceError({ cause: new Error("ledger unavailable") }),
    );

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "ready" });

    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.journal.settle).not.toHaveBeenCalled();
    expect(mocks.state.task).toBe("provider_failed");
  });

  it("keeps pending unknown receipts when submission acceptance is unknown", async () => {
    const { DataForSeoAmbiguousSubmissionError } = await import(
      "@/lib/providers/serp/dataforseo-queued"
    );
    mocks.submit.mockRejectedValueOnce(
      new DataForSeoAmbiguousSubmissionError("acceptance is unknown"),
    );

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      state: "ambiguous",
    });

    expect(mocks.journal.discard).not.toHaveBeenCalled();
    expect(mocks.journal.settle).not.toHaveBeenCalled();
  });

  it("discards pending unknown receipts after a definite provider rejection", async () => {
    const { DataForSeoError } = await import("@/lib/providers/serp/dataforseo-errors");
    mocks.submit.mockRejectedValueOnce(
      new DataForSeoError("DataForSEO rejected the batch.", false, 400),
    );

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "ready" });

    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.journal.discard).toHaveBeenCalledOnce();
    expect(mocks.state.task).toBe("provider_failed");
  });

  it("discards pending unknown receipts when the provider rate limits the POST", async () => {
    const { DataForSeoError } = await import("@/lib/providers/serp/dataforseo-errors");
    mocks.submit.mockRejectedValueOnce(new DataForSeoError("Rate limited.", true, 429));

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      state: "deferred",
    });

    expect(mocks.journal.discard).toHaveBeenCalledOnce();
    expect(mocks.journal.settle).not.toHaveBeenCalled();
  });

  it("marks tasks without a provider response ambiguous instead of free failures", async () => {
    mocks.submit.mockResolvedValueOnce({
      accepted: [],
      failed: [
        { correlationId: "qtask_1", costCents: null, message: "DataForSEO rejected the task." },
      ],
      unknown: [{ correlationId: "qtask_2", message: "DataForSEO did not return a task result." }],
    });

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      state: "submitted",
    });

    expect(mocks.journal.settle).toHaveBeenCalledOnce();
    expect(mocks.prisma.queuedRankCheckTask.updateMany).toHaveBeenCalledWith({
      data: { costCents: null, error: "DataForSEO rejected the task.", state: "provider_failed" },
      where: { id: "qtask_1", state: "submitting" },
    });
    expect(mocks.prisma.queuedRankCheckTask.updateMany).toHaveBeenCalledWith({
      data: {
        error: "DataForSEO did not return a task result.",
        state: "ambiguous",
      },
      where: { id: "qtask_2", state: "submitting" },
    });
  });

  it("recovers a resumed submitting state without a second POST", async () => {
    mocks.state.batch = "submitting";
    mocks.state.task = "submitting";

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      state: "ambiguous",
    });
    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      state: "ambiguous",
    });

    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.beginJournal).not.toHaveBeenCalled();
    expect(mocks.state.task).toBe("ambiguous");
  });

  it("preserves a possibly paid submitting batch for cutover retrieval", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
    mocks.state.batch = "submitting";
    mocks.state.task = "submitting";

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      state: "submitting",
    });

    expect(mocks.deferQueuedRankCheckBatch).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.consumeProviderLimit).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("defers a prepared batch without provider credentials when the access gate denies it", async () => {
    mocks.assertOperationAccess.mockRejectedValueOnce(new OperationAccessDeniedError());

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "deferred" });

    expect(mocks.assertOperationAccess).toHaveBeenCalledWith("project_1");
    expect(mocks.deferQueuedRankCheckBatch).toHaveBeenCalledWith(
      "batch_1",
      "This operation is unavailable for this project.",
    );
    expect(mocks.state.batch).toBe("prepared");
    expect(mocks.state.task).toBe("prepared");
    expect(mocks.resolveProviderCredentials).not.toHaveBeenCalled();
    expect(mocks.consumeProviderLimit).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("bypasses the access gate for a batch another worker already moved to submitting", async () => {
    mocks.state.batch = "submitting";
    mocks.state.task = "submitting";

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "ambiguous" });

    expect(mocks.assertOperationAccess).not.toHaveBeenCalled();
    expect(mocks.resolveProviderCredentials).not.toHaveBeenCalled();
    expect(mocks.consumeProviderLimit).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("does not let a late provider response overwrite a deadline defer", async () => {
    mocks.submit.mockImplementationOnce(async () => {
      mocks.state.batch = "deferred";
      mocks.state.task = "deferred";
      return {
        accepted: [
          {
            correlationId: "qtask_1",
            costCents: 1.2,
            providerTaskId: "provider_1",
          },
        ],
        failed: [],
      };
    });

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      state: "deferred",
    });
    expect(mocks.state.batch).toBe("deferred");
    expect(mocks.state.task).toBe("deferred");
  });

  it("does not pay after cancellation claims the run and commits", async () => {
    const cancellationClaimed = deferred();
    const continueCancellation = deferred();
    const submissionReachedFence = deferred();
    const cancellationCommitted = deferred();
    const allowProvider = deferred();

    mocks.prisma.rankCheckRun.updateMany.mockImplementation(async ({ data }) => {
      if (data.status !== "cancelling") return { count: 0 };
      mocks.state.run = "cancelling";
      cancellationClaimed.resolve();
      await continueCancellation.promise;
      return { count: 1 };
    });
    mocks.prisma.queuedRankCheckBatch.updateMany.mockImplementation(async ({ data, where }) => {
      if (data.state === "submitting") submissionReachedFence.resolve();
      if (!data.state || mocks.state.batch !== where.state) return { count: 0 };
      mocks.state.batch = data.state;
      return { count: 1 };
    });
    mocks.prisma.$queryRaw.mockImplementation(async () => {
      submissionReachedFence.resolve();
      await cancellationCommitted.promise;
      return [{ status: mocks.state.run }];
    });
    mocks.consumeProviderLimit.mockImplementation(async () => {
      await allowProvider.promise;
      return { accountKey: "dataforseo:account", success: true };
    });

    const cancellation = cancelRankCheckRun(mocks.prisma as never, "run_1");
    await cancellationClaimed.promise;
    const submission = submitQueuedRankCheckBatch("batch_1");
    await submissionReachedFence.promise;
    continueCancellation.resolve();
    await expect(cancellation).resolves.toBe(true);
    cancellationCommitted.resolve();
    allowProvider.resolve();
    await submission;

    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
