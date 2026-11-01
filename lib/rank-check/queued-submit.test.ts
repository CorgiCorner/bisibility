import { recordConnectionAccountFailure } from "@/lib/integrations/provider-recovery/account-failure";
import { recordRankRefusals } from "@/lib/integrations/provider-recovery/refusal-journal";
import { ProviderRecoveryAdmissionError } from "@/lib/providers/usage";
import { resetRecordedWorkerDefinition } from "@/lib/rank-check/recorded-worker-definition.test-fixture";
import { persistQueuedRefusal } from "./queued-account-observation";

vi.mock("@/lib/integrations/provider-recovery/account-failure", () => ({
  recordConnectionAccountFailure: vi.fn(async () => true),
}));
vi.mock("@/lib/integrations/provider-recovery/refusal-journal", () => ({
  recordRankRefusals: vi.fn(async () => undefined),
}));

vi.mock("@/lib/measurement-definitions/worker-queued", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/measurement-definitions/worker-queued")>();
  const { recordedQueuedWorkerSessions } = await import(
    "./recorded-worker-definition.test-fixture"
  );
  const { workerDefinitionOwner } = await vi.importActual<
    typeof import("@/lib/measurement-definitions/worker-session")
  >("@/lib/measurement-definitions/worker-session");
  return { ...actual, queuedWorkerSessions: recordedQueuedWorkerSessions(workerDefinitionOwner) };
});

import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { deferred } from "@/tests/deferred";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitQueuedRankCheckBatch } from "./queued-submit";
import { cancelRankCheckRun } from "./runs/cancel";

const mocks = vi.hoisted(() => {
  const state = {
    batch: "prepared",
    credentialSource: "own",
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
    connection: {
      credentialsEncrypted: "encrypted",
      credentialSource: state.credentialSource,
      provider: "dataforseo",
      id: "connection_1",
    },
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
        rankCheckId: "rank_1",
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
    providerBlockedAttempt: { findMany: vi.fn().mockResolvedValue([]) },
    meteringPaidAttemptContext: { findFirst: vi.fn().mockResolvedValue(null) },
    rankCheckRun: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    rankCheckRunItem: {
      updateMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([{ id: "item_1", rankCheckId: "rank_1" }]),
    },
  };
  return {
    assertQueuedRankCheckBatchAllocation: vi.fn(),
    assertOperationAccess: vi.fn(),
    assertOwnKeyStored: vi.fn(),
    beginJournal: vi.fn(),
    nativeCosts: vi.fn(),
    startHosted: vi.fn(),
    consumeProviderLimit: vi.fn(),
    deferQueuedRankCheckBatch: vi.fn(),
    journal: { discard: vi.fn(), settle: vi.fn(), transportStarted: vi.fn() },
    prisma,
    resolveProviderCredentials: vi.fn(),
    state,
    submit: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-rates/native-rank-request", () => ({
  loadNativeRankRequestCosts: mocks.nativeCosts,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/operations/access-extension", () => ({
  assertOperationAccessInTransaction: vi.fn(),
  assertOperationAccess: mocks.assertOperationAccess,
}));
vi.mock("./allocation-enforcement", () => ({
  assertQueuedRankCheckBatchAllocation: mocks.assertQueuedRankCheckBatchAllocation,
}));
vi.mock("@/lib/providers/execution-extension", () => ({
  startQueuedDeploymentExecution: mocks.startHosted,
}));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: mocks.resolveProviderCredentials,
}));
vi.mock("@/lib/providers/own-key-guard", () => ({
  assertOwnKeyStored: mocks.assertOwnKeyStored,
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
    prepareDataForSeoQueuedTasks: (
      input: Parameters<typeof original.prepareDataForSeoQueuedTasks>[0],
    ) => ({
      ...original.prepareDataForSeoQueuedTasks(input),
      submit: () => mocks.submit(input),
    }),
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
    resetRecordedWorkerDefinition();
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    vi.clearAllMocks();
    mocks.nativeCosts.mockResolvedValue([0.725]);
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "1");
    mocks.state.batch = "prepared";
    mocks.state.credentialSource = "own";
    mocks.startHosted.mockResolvedValue(null);
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
    mocks.assertOwnKeyStored.mockResolvedValue(undefined);
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

  it.each([
    ["account_blocked", "provider_account_blocked"],
    ["accounting_review", "usage_unconfirmed"],
  ])("resumes persisted %s refusal without another provider request", async (reason, expected) => {
    mocks.state.batch = "submitting";
    mocks.prisma.providerBlockedAttempt.findMany.mockResolvedValueOnce([
      { rankCheckId: "rank_1", refusalKey: "incident", reason },
    ]);
    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "deferred" });
    expect(mocks.deferQueuedRankCheckBatch).toHaveBeenCalledWith("batch_1", expected, {
      preSend: true,
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("finishes a proven refusal even after scheduler cutover", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
    mocks.state.batch = "submitting";
    mocks.prisma.providerBlockedAttempt.findMany.mockResolvedValueOnce([
      { rankCheckId: "rank_1", refusalKey: "incident", reason: "account_blocked" },
    ]);
    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "deferred" });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it.each(["journal", "deferral"])(
    "retries only persistence after the %s write fails",
    async (failedWrite) => {
      const refusal = new ProviderRecoveryAdmissionError("account_blocked", { kind: "account" });
      mocks.beginJournal.mockRejectedValueOnce(refusal);
      if (failedWrite === "journal")
        vi.mocked(recordRankRefusals).mockRejectedValueOnce(new Error("temporary database error"));
      else
        mocks.deferQueuedRankCheckBatch.mockRejectedValueOnce(
          new Error("temporary database error"),
        );
      const pending = await submitQueuedRankCheckBatch("batch_1");
      expect(pending).toMatchObject({
        state: "refusal_pending",
        refusal: { reason: "account_blocked", rankCheckIds: ["rank_1"] },
      });
      if (!("refusal" in pending) || !pending.refusal) throw new Error("Missing refusal proof");
      await expect(persistQueuedRefusal(pending.refusal)).resolves.toMatchObject({
        state: "deferred",
      });
      expect(recordRankRefusals).toHaveBeenCalledTimes(2);
      expect(mocks.deferQueuedRankCheckBatch).toHaveBeenLastCalledWith(
        "batch_1",
        "provider_account_blocked",
        { preSend: true },
      );
      expect(mocks.submit).not.toHaveBeenCalled();
    },
  );

  it("journals a pre-send batch refusal and a duplicate delivery never sends", async () => {
    const refusal = new ProviderRecoveryAdmissionError("accounting_review", { kind: "account" });
    mocks.beginJournal.mockRejectedValueOnce(refusal);
    mocks.deferQueuedRankCheckBatch.mockImplementationOnce(async () => {
      mocks.state.batch = "deferred";
      return { state: "deferred" };
    });
    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "deferred" });
    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "deferred" });
    expect(recordRankRefusals).toHaveBeenCalledOnce();
    expect(recordRankRefusals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        checks: [{ rankCheckId: "rank_1" }],
        refusal,
      }),
    );
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.deferQueuedRankCheckBatch).toHaveBeenCalledWith("batch_1", "usage_unconfirmed", {
      preSend: true,
    });
  });

  it("defers a pre-send account block with its distinct reason", async () => {
    const refusal = new ProviderRecoveryAdmissionError("account_blocked", { kind: "account" });
    mocks.beginJournal.mockRejectedValueOnce(refusal);
    await submitQueuedRankCheckBatch("batch_1");
    expect(mocks.deferQueuedRankCheckBatch).toHaveBeenCalledWith(
      "batch_1",
      "provider_account_blocked",
      { preSend: true },
    );
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("uses hosted credentials and a credit journal with a retained key", async () => {
    mocks.state.credentialSource = "hosted";
    const execution = {
      credentials: { login: "hosted-login", password: "hosted-only" },
      abort: vi.fn(),
      begin: vi.fn(),
      transportStarted: vi.fn(),
      record: vi.fn(),
      finish: vi.fn(),
    };
    mocks.startHosted.mockResolvedValue(execution);
    await submitQueuedRankCheckBatch("batch_1");
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: execution.credentials,
        tasks: [expect.objectContaining({ tag: expect.stringContaining(";cs=hosted;") })],
      }),
    );
    expect(execution.record).toHaveBeenCalledWith([
      expect.objectContaining({ providerRequestId: "provider_1", costCents: 1.2 }),
    ]);
    expect(execution.finish).toHaveBeenCalledOnce();
    expect(mocks.resolveProviderCredentials).not.toHaveBeenCalled();
    expect(mocks.beginJournal).not.toHaveBeenCalled();
  });
  it("refuses a hosted submission without credit execution instead of using its retained key", async () => {
    mocks.state.credentialSource = "hosted";
    await expect(submitQueuedRankCheckBatch("batch_1")).rejects.toThrow(
      "Queued hosted execution is unavailable.",
    );
    expect(mocks.resolveProviderCredentials).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("retains a known not-sent failure when shared admission is unavailable", async () => {
    mocks.beginJournal.mockRejectedValueOnce(new Error("accounting unavailable"));
    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "ready" });
    expect(mocks.state.task).toBe("provider_failed");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("defers the whole batch when its allocation estimate is exhausted", async () => {
    const { ProviderAllocationExhaustedError } = await import("@/lib/provider-usage/enforcement");
    mocks.beginJournal.mockRejectedValueOnce(
      new ProviderAllocationExhaustedError("connection_1", "app"),
    );

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "deferred" });

    expect(mocks.deferQueuedRankCheckBatch).toHaveBeenCalledWith("batch_1", "budget_exhausted:app");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("posts only after durably moving the ledger to submitting", async () => {
    await submitQueuedRankCheckBatch("batch_1");

    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.submit.mock.calls[0]?.[0].tasks[0].estimate.cents).toBe("0.7250");
    expect(mocks.journal.transportStarted).toHaveBeenCalledOnce();
    expect(mocks.journal.transportStarted.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submit.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.consumeProviderLimit).toHaveBeenCalledOnce();
    expect(mocks.prisma.queuedRankCheckBatch.updateMany).toHaveBeenCalledWith({
      data: { state: "submitting" },
      where: { id: "batch_1", state: "prepared" },
    });
    expect(mocks.prisma.queuedRankCheckBatch.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submit.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not POST or open a journal when the native quote is unknown", async () => {
    mocks.nativeCosts.mockResolvedValueOnce([null]);
    await submitQueuedRankCheckBatch("batch_1");
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.beginJournal).not.toHaveBeenCalled();
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

    expect(mocks.assertQueuedRankCheckBatchAllocation).not.toHaveBeenCalled();
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
      beforeFence: { lockBusiness: expect.any(Function), assertDispatch: expect.any(Function) },
      beforeReserve: new Map([
        ["qtask_1", { lockBusiness: expect.any(Function), assertRequest: expect.any(Function) }],
      ]),
      client: mocks.prisma,
      connectionId: "connection_1",
      credentialVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
      projectId: "project_1",
      providerRequests: [
        expect.objectContaining({
          method: "POST",
          url: "https://api.dataforseo.com/v3/serp/google/organic/task_post",
        }),
      ],
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

  it("retains unknown receipts when a provider rejection cannot prove the POST was uncharged", async () => {
    const { DataForSeoError } = await import("@/lib/providers/serp/dataforseo-errors");
    mocks.submit.mockRejectedValueOnce(
      new DataForSeoError("DataForSEO rejected the batch.", false, 400),
    );

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "ambiguous" });

    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.journal.discard).not.toHaveBeenCalled();
    expect(mocks.state.task).toBe("ambiguous");
  });

  it("logs one structured line with the rejection status fields and no credentials", async () => {
    const fake = { login: "fake-login@example.test", password: "Fake-Pass-9137" };
    const basic = Buffer.from(`${fake.login}:${fake.password}`).toString("base64");
    mocks.resolveProviderCredentials.mockReturnValue(fake);
    const actual = await vi.importActual<typeof import("@/lib/providers/serp/dataforseo-queued")>(
      "@/lib/providers/serp/dataforseo-queued",
    );
    mocks.submit.mockImplementationOnce((input) =>
      actual.prepareDataForSeoQueuedTasks(input).submit(),
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status_code: 40200,
          status_message: `Payment Required: ${fake.login}/${fake.password} Authorization: Basic ${basic}`,
        }),
        { status: 402 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "ambiguous" });
      expect(recordConnectionAccountFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: "connection_1",
          credentialVersion: expect.any(String),
          fact: {
            kind: "failure",
            code: "provider_billing",
            scope: { kind: "capability", capability: "rank_check" },
          },
        }),
      );

      const lines = warn.mock.calls.filter(
        ([message]) => message === "[queued-rank-check] submission not confirmed",
      );
      expect(lines).toHaveLength(1);
      expect(lines[0]?.[1]).toEqual({
        outcome: "ambiguous",
        batchId: "batch_1",
        connectionId: "connection_1",
        phase: "rejected",
        httpStatus: 402,
        dataforseoStatusCode: 40200,
        dataforseoStatusMessage: expect.stringContaining("Payment Required: [redacted]"),
        errorName: "DataForSeoError",
      });
      const logged = JSON.stringify(warn.mock.calls);
      for (const secret of [
        fake.login,
        fake.password,
        basic,
        "private keyword text",
        "example.com",
      ])
        expect(logged).not.toContain(secret);
      const sentHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(logged).not.toContain(sentHeaders.Authorization);
      expect(mocks.prisma.queuedRankCheckBatch.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            error: expect.stringContaining(
              "DataForSEO submission rejection is not proof of zero charge: DataForSEO task submission failed with HTTP 402, status 40200: Payment Required: [redacted]",
            ),
            state: "ambiguous",
          }),
        }),
      );
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("retains unknown receipts when a POST throttle response has no native zero-charge proof", async () => {
    const { DataForSeoError } = await import("@/lib/providers/serp/dataforseo-errors");
    mocks.submit.mockRejectedValueOnce(new DataForSeoError("Rate limited.", true, 429));

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({
      state: "ambiguous",
    });

    expect(mocks.journal.discard).not.toHaveBeenCalled();
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

  it("defers an own-key batch whose key would come from the environment for a tester account", async () => {
    const { OwnProviderKeyRequiredError } = await import(
      "@/lib/providers/execution-extension-errors"
    );
    const refusal = new OwnProviderKeyRequiredError({
      capability: "rank_check",
      provider: "dataforseo",
    });
    mocks.assertOwnKeyStored.mockRejectedValueOnce(refusal);

    await expect(submitQueuedRankCheckBatch("batch_1")).resolves.toEqual({ state: "deferred" });

    expect(mocks.assertOwnKeyStored).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "rank_check", projectId: "project_1" }),
    );
    expect(mocks.deferQueuedRankCheckBatch).toHaveBeenCalledWith("batch_1", refusal.message);
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
    const cancellationClaimed = deferred<void>();
    const continueCancellation = deferred<void>();
    const submissionReachedFence = deferred<void>();
    const cancellationCommitted = deferred<void>();
    const allowProvider = deferred<void>();

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
