import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistReadyQueuedRankCheckTasks } from "./queued-results";
import { QUEUED_DEADLINE_REASON } from "./queued-timeouts";

const mocks = vi.hoisted(() => {
  type Task = ReturnType<typeof makeTask>;
  function makeTask(
    id: string,
    state: string,
    error: string | null,
    costCents = 1.2,
  ): {
    batch: {
      connection: {
        costPerCheckCents: null;
        credentialsEncrypted: string;
        id: string;
      };
      connectionId: string;
      priority: string;
    };
    costCents: number;
    error: string | null;
    id: string;
    keyword: {
      id: string;
      project: { defaults: { frequency: string }; domain: string };
      projectId: string;
      publicId: string;
      rankChecks: Array<{ position: number; rankingUrl: string; raw: null }>;
      schedule: null;
      targetUrl: null;
      text: string;
    };
    keywordId: string;
    providerTaskId: string;
    persistenceLeaseExpiresAt: Date | null;
    persistenceLeaseOwner: string | null;
    rankCheck: { requestedDepth: number; status: string };
    rankCheckId: string;
    state: string;
  } {
    return {
      batch: {
        connection: {
          costPerCheckCents: null,
          credentialsEncrypted: "encrypted",
          id: "connection_1",
        },
        connectionId: "connection_1",
        priority: "high",
      },
      costCents,
      error,
      id,
      keyword: {
        id: `keyword_${id}`,
        project: { defaults: { frequency: "daily" }, domain: "example.com" },
        projectId: "project_1",
        publicId: `kw_a${id.padEnd(23, "0").slice(0, 23)}`,
        rankChecks: [{ position: 8, rankingUrl: "https://example.com/old", raw: null }],
        schedule: null,
        targetUrl: null,
        text: `private ${id}`,
      },
      keywordId: `keyword_${id}`,
      providerTaskId: `provider_${id}`,
      persistenceLeaseExpiresAt:
        state === "persisting" ? new Date("2026-01-01T00:00:00.000Z") : null,
      persistenceLeaseOwner: state === "persisting" ? `abandoned_${id}` : null,
      rankCheck: { requestedDepth: 100, status: "running" },
      rankCheckId: `rank_check_${id}`,
      state,
    };
  }
  const tasks: Task[] = [
    makeTask("success", "persisting", null),
    makeTask("failure", "provider_failed", "one task was rejected"),
  ];
  const prisma = {
    $queryRaw: vi.fn(async (query: { strings?: string[]; values?: unknown[] }) => {
      const sql = query.strings?.join("?") ?? "";
      const values = query.values ?? [];
      if (sql.includes("\"state\" = 'persisting'")) {
        const databaseNow = new Date();
        const owner = String(values[1]);
        const taskId = String(values[2]);
        const task = tasks.find((candidate) => candidate.id === taskId);
        if (
          !task ||
          !(
            (task.persistenceLeaseExpiresAt === null &&
              task.persistenceLeaseOwner === null &&
              ["provider_failed", "ready"].includes(task.state)) ||
            (task.persistenceLeaseExpiresAt !== null &&
              task.persistenceLeaseOwner !== null &&
              task.persistenceLeaseExpiresAt <= databaseNow &&
              task.state === "persisting")
          )
        ) {
          return [];
        }
        task.persistenceLeaseOwner = owner;
        task.persistenceLeaseExpiresAt = new Date(databaseNow.getTime() + Number(values[0]));
        task.state = "persisting";
        return [{ expiresAt: task.persistenceLeaseExpiresAt }];
      }
      const hasError = sql.includes('"error" =');
      const nextState = String(values[0]);
      const taskId = String(values[hasError ? 2 : 1]);
      const owner = values[hasError ? 3 : 2];
      const from = values.slice(hasError ? 4 : 3).map(String);
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task || task.persistenceLeaseOwner !== owner || !from.includes(task.state)) return [];
      task.state = nextState;
      task.persistenceLeaseOwner = null;
      task.persistenceLeaseExpiresAt = null;
      return [{ state: nextState }];
    }),
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    queuedRankCheckBatch: {
      findUnique: vi.fn(async () => ({ state: "submitted" })),
    },
    queuedRankCheckTask: {
      findMany: vi.fn(async ({ where }: { where: { state: { in: string[] } } }) =>
        tasks
          .filter((task) => where.state.in.includes(task.state))
          .map((task) => ({ id: task.id })),
      ),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const task = tasks.find((candidate) => candidate.id === where.id);
        if (!task) throw new Error("missing task");
        return task;
      }),
      update: vi.fn(
        async ({ data, where }: { data: { state?: string }; where: { id: string } }) => {
          const task = tasks.find((candidate) => candidate.id === where.id);
          if (task && data.state) task.state = data.state;
          return task;
        },
      ),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: {
            id: string;
            OR?: Array<Record<string, unknown>>;
            persistenceLeaseOwner?: string;
            state?: string | { in: string[] };
          };
        }) => {
          const task = tasks.find((candidate) => candidate.id === where.id);
          const stateMatches = (value: unknown) =>
            value === undefined ||
            (typeof value === "string"
              ? task?.state === value
              : (value as { in?: string[] }).in?.includes(task?.state ?? "") !== false);
          const clauseMatches = (clause: Record<string, unknown>) =>
            stateMatches(clause.state) &&
            (!("persistenceLeaseOwner" in clause) ||
              (clause.persistenceLeaseOwner !== null &&
              typeof clause.persistenceLeaseOwner === "object"
                ? task?.persistenceLeaseOwner !== null
                : task?.persistenceLeaseOwner === clause.persistenceLeaseOwner)) &&
            (!("persistenceLeaseExpiresAt" in clause) ||
              (clause.persistenceLeaseExpiresAt === null
                ? task?.persistenceLeaseExpiresAt === null
                : Boolean(
                    task?.persistenceLeaseExpiresAt &&
                      task.persistenceLeaseExpiresAt <=
                        (clause.persistenceLeaseExpiresAt as { lte: Date }).lte,
                  )));
          const matches =
            task &&
            stateMatches(where.state) &&
            (where.persistenceLeaseOwner === undefined ||
              task.persistenceLeaseOwner === where.persistenceLeaseOwner) &&
            (!where.OR || where.OR.some(clauseMatches));
          if (!task || !matches) return { count: 0 };
          if ("state" in data) task.state = String(data.state);
          if ("persistenceLeaseOwner" in data) {
            task.persistenceLeaseOwner = data.persistenceLeaseOwner as string | null;
          }
          if ("persistenceLeaseExpiresAt" in data) {
            task.persistenceLeaseExpiresAt = data.persistenceLeaseExpiresAt as Date | null;
          }
          return { count: 1 };
        },
      ),
    },
    rankCheck: {
      findFirst: vi.fn(),
    },
  };
  return {
    consumeProviderLimit: vi.fn(),
    defer: vi.fn(),
    fetchResult: vi.fn(),
    finalize: vi.fn(),
    makeTask,
    persistFailed: vi.fn(),
    persistRankCheck: vi.fn(),
    prisma,
    resolveCredentials: vi.fn(),
    tasks,
    writeCooldown: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: mocks.resolveCredentials,
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: mocks.consumeProviderLimit,
  writeCooldown: mocks.writeCooldown,
}));
vi.mock("@/lib/providers/serp/dataforseo-queued", () => ({
  fetchDataForSeoQueuedResult: mocks.fetchResult,
}));
vi.mock("./queued-lifecycle", () => ({
  deferQueuedRankCheckBatch: mocks.defer,
  finalizeQueuedBatchState: mocks.finalize,
}));
vi.mock("./scheduler-mode", () => ({
  dispatcherClaimsAllowed: (mode: string) => mode === "dispatcher",
  rankCheckSchedulerMode: () => "dispatcher",
}));
vi.mock("./runner", async (importOriginal) => {
  const original = await importOriginal<typeof import("./runner")>();
  return {
    ...original,
    persistFailedRankCheck: mocks.persistFailed,
    persistRankCheck: mocks.persistRankCheck,
  };
});

describe("queued result persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tasks.splice(
      0,
      mocks.tasks.length,
      mocks.makeTask("success", "persisting", null),
      mocks.makeTask("failure", "provider_failed", "one task was rejected"),
    );
    mocks.resolveCredentials.mockReturnValue({ login: "login", password: "password" });
    mocks.prisma.rankCheck.findFirst.mockResolvedValue({
      position: 8,
      rankingUrl: "https://example.com/old",
      raw: null,
    });
    mocks.consumeProviderLimit.mockResolvedValue({
      accountKey: "dataforseo:account",
      cooling: false,
      remaining: 100,
      resetAt: Date.now() + 60_000,
      success: true,
    });
    mocks.fetchResult.mockResolvedValue({
      status_code: 20000,
      tasks: [
        {
          cost: 0.012,
          result: [
            {
              items: [
                {
                  domain: "example.com",
                  rank_absolute: 4,
                  rank_group: 3,
                  type: "organic",
                  url: "https://example.com/new",
                },
              ],
            },
          ],
          status_code: 20000,
        },
      ],
    });
    mocks.persistRankCheck.mockImplementation(async (context) => {
      const task = mocks.tasks.find(
        (candidate) => candidate.rankCheckId === context.existingRankCheckId,
      );
      if (task) task.rankCheck.status = "completed";
      await context.persistenceFinalize?.(mocks.prisma);
      return {};
    });
    mocks.persistFailed.mockImplementation(async (input) => {
      const task = mocks.tasks.find(
        (candidate) => candidate.rankCheckId === input.existingRankCheckId,
      );
      if (task) task.rankCheck.status = "failed";
      await input.persistenceFinalize?.(mocks.prisma);
      return {};
    });
    mocks.finalize.mockResolvedValue({
      completed: 1,
      failed: 1,
      pending: 0,
      state: "failed",
    });
    mocks.defer.mockImplementation(async () => {
      for (const task of mocks.tasks) {
        if (["persisting", "provider_failed", "ready"].includes(task.state)) {
          task.rankCheck.status = "deferred";
          task.state = "deferred";
        }
      }
      return { completed: 1, failed: 0, pending: 0, state: "deferred" };
    });
  });

  it("recovers a persisting task, isolates partial failure, and records actual cost once", async () => {
    await expect(persistReadyQueuedRankCheckTasks("batch_1")).resolves.toEqual({
      completed: 1,
      failed: 1,
      pending: 0,
      state: "failed",
    });

    expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
    expect(mocks.persistRankCheck.mock.calls[0]?.[1]).toMatchObject({
      providerCostCents: 1.2,
      comparisonAllowed: true,
      rankCheck: {
        billingUnits: 10,
        costCents: 1.2,
        normalizationVersion: "v2",
        position: 3,
        rankingUrl: "https://example.com/new",
        raw: {
          normalization: {
            anomalies: [],
            outcome: "match",
            version: "v2",
          },
        },
      },
    });
    expect(mocks.prisma.rankCheck.findFirst).toHaveBeenCalledWith({
      orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
      where: {
        keywordId: "keyword_success",
        normalizationVersion: "v2",
        requestedDepth: 100,
        status: "completed",
      },
    });
    expect(mocks.persistFailed).toHaveBeenCalledOnce();
    expect(mocks.persistFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "one task was rejected",
        providerCostCents: 1.2,
      }),
    );
    expect(mocks.tasks.map((task) => task.state)).toEqual(["completed", "failed"]);

    await persistReadyQueuedRankCheckTasks("batch_1");
    expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
    expect(mocks.persistFailed).toHaveBeenCalledOnce();
  });

  it("selects the minimum rank_group from all matching queued results", async () => {
    mocks.tasks.splice(0, mocks.tasks.length, mocks.makeTask("success", "ready", null));
    mocks.fetchResult.mockResolvedValue({
      status_code: 20000,
      tasks: [
        {
          cost: 0.012,
          result: [
            {
              items: [
                {
                  domain: "example.com",
                  rank_absolute: 3,
                  rank_group: 8,
                  type: "organic",
                  url: "https://example.com/later",
                },
                {
                  domain: "www.example.com",
                  rank_absolute: 7,
                  rank_group: 2,
                  type: "organic",
                  url: "https://www.example.com/best",
                },
              ],
            },
          ],
          status_code: 20000,
        },
      ],
    });
    mocks.finalize.mockResolvedValue({
      completed: 1,
      failed: 0,
      pending: 0,
      state: "completed",
    });

    await persistReadyQueuedRankCheckTasks("batch_1");

    expect(mocks.persistRankCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rankCheck: expect.objectContaining({
          position: 2,
          rankingUrl: "https://www.example.com/best",
        }),
      }),
    );
    expect(mocks.persistFailed).not.toHaveBeenCalled();
  });

  it("fails a queued result when a matching organic item lacks rank_group", async () => {
    mocks.tasks.splice(0, mocks.tasks.length, mocks.makeTask("success", "ready", null));
    mocks.fetchResult.mockResolvedValue({
      status_code: 20000,
      tasks: [
        {
          cost: 0.012,
          result: [
            {
              items: [
                {
                  domain: "example.com",
                  rank_absolute: 1,
                  type: "organic",
                  url: "https://example.com/malformed",
                },
              ],
            },
          ],
          status_code: 20000,
        },
      ],
    });
    mocks.finalize.mockResolvedValue({
      completed: 0,
      failed: 1,
      pending: 0,
      state: "failed",
    });

    await persistReadyQueuedRankCheckTasks("batch_1");

    expect(mocks.persistRankCheck).not.toHaveBeenCalled();
    expect(mocks.persistFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("organic_rank_missing"),
      }),
    );
    expect(mocks.tasks[0]?.state).toBe("failed");
  });

  it("leaves retryable result failures pending for the next workflow timer", async () => {
    mocks.tasks.splice(0, mocks.tasks.length, mocks.makeTask("success", "ready", null));
    mocks.fetchResult.mockRejectedValue(new DataForSeoError("temporary 503", true, 503));
    mocks.finalize.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 1,
      state: "submitted",
    });

    await expect(persistReadyQueuedRankCheckTasks("batch_1")).resolves.toMatchObject({
      pending: 1,
    });

    expect(mocks.fetchResult).toHaveBeenCalledOnce();
    expect(mocks.writeCooldown).toHaveBeenCalledWith("dataforseo:account");
    expect(mocks.persistFailed).not.toHaveBeenCalled();
    expect(mocks.tasks[0]?.state).toBe("ready");

    mocks.consumeProviderLimit.mockResolvedValueOnce({
      accountKey: "dataforseo:account",
      cooling: true,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      success: false,
    });
    await expect(persistReadyQueuedRankCheckTasks("batch_1")).resolves.toMatchObject({
      pending: 1,
    });
    expect(mocks.fetchResult).toHaveBeenCalledOnce();
    expect(mocks.persistFailed).not.toHaveBeenCalled();
    expect(mocks.tasks[0]?.state).toBe("ready");
  });

  it("records terminal failed-result cost once when submission cost was zero", async () => {
    mocks.tasks.splice(0, mocks.tasks.length, mocks.makeTask("failure", "ready", null, 0));
    mocks.fetchResult.mockResolvedValue({
      status_code: 20000,
      tasks: [
        {
          cost: 0.024,
          status_code: 40501,
          status_message: "Queued task failed.",
        },
      ],
    });
    mocks.finalize.mockResolvedValue({
      completed: 0,
      failed: 1,
      pending: 0,
      state: "failed",
    });

    await Promise.all([
      persistReadyQueuedRankCheckTasks("batch_1"),
      persistReadyQueuedRankCheckTasks("batch_1"),
    ]);
    await persistReadyQueuedRankCheckTasks("batch_1");

    expect(mocks.fetchResult).toHaveBeenCalledOnce();
    expect(mocks.persistFailed).toHaveBeenCalledOnce();
    expect(mocks.persistFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Queued task failed.",
        providerCostCents: 2.4,
      }),
    );
    expect(mocks.tasks[0]?.state).toBe("failed");
  });

  it("stops task GETs at the absolute deadline and runs canonical cleanup", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T00:14:59.000Z"));
    mocks.tasks.splice(
      0,
      mocks.tasks.length,
      mocks.makeTask("first", "ready", null),
      mocks.makeTask("later", "ready", null),
    );
    mocks.fetchResult.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-07-29T00:15:00.000Z"));
      return {
        status_code: 20000,
        tasks: [{ cost: 0.012, result: [{ items: [] }], status_code: 20000 }],
      };
    });
    mocks.finalize.mockResolvedValue({
      completed: 1,
      failed: 0,
      pending: 1,
      state: "ready",
    });

    await persistReadyQueuedRankCheckTasks("batch_1", {
      deadlineAt: new Date("2026-07-29T00:15:00.000Z"),
    });

    expect(mocks.fetchResult).toHaveBeenCalledOnce();
    expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
    expect(mocks.tasks[1]?.state).toBe("deferred");
    expect(mocks.defer).toHaveBeenCalledWith("batch_1", QUEUED_DEADLINE_REASON);
    expect(mocks.finalize).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not regress a task deferred while a late result attempt was running", async () => {
    mocks.tasks.splice(0, mocks.tasks.length, mocks.makeTask("success", "ready", null));
    mocks.persistRankCheck.mockImplementationOnce(async () => {
      const task = mocks.tasks[0];
      if (task) {
        task.rankCheck.status = "deferred";
        task.state = "deferred";
      }
      throw new (await import("./persistence-errors")).RankCheckClosedBeforePersistenceError();
    });
    mocks.finalize.mockResolvedValue({
      completed: 0,
      failed: 0,
      pending: 0,
      state: "deferred",
    });

    await persistReadyQueuedRankCheckTasks("batch_1");

    expect(mocks.tasks[0]?.state).toBe("deferred");
    expect(mocks.persistFailed).not.toHaveBeenCalled();
  });

  it("releases a cancelled owner before a later attempt persists", async () => {
    mocks.tasks.splice(0, mocks.tasks.length, mocks.makeTask("success", "ready", null));
    const controller = new AbortController();
    const cancellation = new Error("activity cancelled");
    mocks.fetchResult.mockImplementation(
      async (_credentials: unknown, _providerTaskId: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), {
            once: true,
          });
        }),
    );

    const first = persistReadyQueuedRankCheckTasks("batch_1", {
      signal: controller.signal,
    });
    const rejection = expect(first).rejects.toBe(cancellation);
    await vi.waitFor(() => expect(mocks.fetchResult).toHaveBeenCalledOnce());
    controller.abort(cancellation);
    await rejection;

    expect(mocks.tasks[0]?.state).toBe("ready");
    expect(mocks.tasks[0]?.persistenceLeaseOwner).toBeNull();
    expect(mocks.persistRankCheck).not.toHaveBeenCalled();

    mocks.fetchResult.mockResolvedValue({
      status_code: 20000,
      tasks: [
        {
          cost: 0.012,
          result: [{ items: [] }],
          status_code: 20000,
        },
      ],
    });
    await persistReadyQueuedRankCheckTasks("batch_1");

    expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
    expect(mocks.tasks[0]?.state).toBe("completed");
  });
});
