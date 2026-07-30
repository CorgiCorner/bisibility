import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitQueuedRankCheckBatch } from "./queued-submit";

const mocks = vi.hoisted(() => {
  const state = { batch: "prepared", task: "prepared" };
  const batch = () => ({
    connection: { credentialsEncrypted: "encrypted", id: "connection_1" },
    connectionId: "connection_1",
    id: "batch_1",
    priority: "high",
    project: {
      defaults: { serpStopOnMatch: true },
      domain: "example.com",
    },
    projectId: "project_1",
    state: state.batch,
    tasks: [
      {
        id: "qtask_1",
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
          data: { state?: string };
          where: { state?: string | { in: string[] } };
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
  };
  return {
    consumeProviderLimit: vi.fn(),
    deferQueuedRankCheckBatch: vi.fn(),
    prisma,
    resolveProviderCredentials: vi.fn(),
    state,
    submit: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
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

describe("queued paid-call fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "1");
    mocks.state.batch = "prepared";
    mocks.state.task = "prepared";
    mocks.resolveProviderCredentials.mockReturnValue({
      login: "login",
      password: "password",
    });
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
    mocks.submit.mockResolvedValue({
      accepted: [
        {
          correlationId: "qtask_1",
          costCents: 1.2,
          providerTaskId: "provider_1",
        },
      ],
      failed: [],
    });
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
});
