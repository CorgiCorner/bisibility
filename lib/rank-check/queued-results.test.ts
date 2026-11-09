import { frozenRequest } from "@/lib/measurement-definitions/canonical";
import {
  definitionHeadFixture,
  definitionSourceFixture,
} from "@/lib/measurement-definitions/fixtures";
import { hostDefinitionAdapters } from "@/lib/measurement-definitions/host-adapters";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import converterFixture from "@/lib/providers/serp/fixtures/goto/converter_full_page.json";
import redirectFixture from "@/lib/providers/serp/fixtures/goto/task_get_goto_heavy.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspectQueuedRankCheckBatch } from "./queued-inspect";
import { persistReadyQueuedRankCheckTasks } from "./queued-results";
import type {
  QueuedResolutionProgress,
  QueuedSourceEvidenceReason,
} from "./queued-source-evidence";
import { QUEUED_DEADLINE_REASON } from "./queued-timeouts";

function retainedSourceFixture(projectId: string, keywordId: string) {
  const source = definitionSourceFixture();
  source.projectId = projectId;
  source.keywordId = keywordId;
  source.target.domain = "example.com";
  if (!source.policy.defaults) throw new Error("Synthetic defaults are required.");
  source.policy.defaults.serpDepth = 20;
  source.target.targetUrl = null;
  if (!source.policy.config) throw new Error("Synthetic policy configuration is required.");
  source.policy.config.adapters = hostDefinitionAdapters();
  return source;
}

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
        credentialSource: string;
        id: string;
      };
      connectionId: string;
      credentialId: string | null;
      credentialKind: string | null;
      priority: string;
      source: string | null;
      trigger: string | null;
    };
    costCents: number | null;
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
    rankCheck: { requestedDepth: number; status: string; estimatedCostCents: number | null };
    rankCheckId: string;
    state: string;
  } {
    return {
      batch: {
        connection: {
          costPerCheckCents: null,
          credentialsEncrypted: "encrypted",
          credentialSource: "own",
          id: "connection_1",
        },
        connectionId: "connection_1",
        credentialId: null,
        credentialKind: null,
        priority: "high",
        source: null,
        trigger: null,
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
      rankCheck: { requestedDepth: 100, status: "running", estimatedCostCents: 0.725 },
      rankCheckId: `rank_check_${id}`,
      state,
    };
  }
  const missingBindings = new Set<string>();
  const tasks: Task[] = [
    makeTask("success", "persisting", null),
    makeTask("failure", "provider_failed", "one task was rejected"),
  ];
  const prisma = {
    providerResponseCapture: { create: vi.fn(async () => ({})) },
    providerConnection: { findFirst: vi.fn(async () => ({ projectId: "project_1" })) },
    $queryRaw: vi.fn(
      async (
        query: { strings?: string[]; values?: unknown[] } | TemplateStringsArray,
        ...parameters: unknown[]
      ) => {
        const sql = (
          Array.isArray(query) ? query : ((query as { strings?: string[] }).strings ?? [])
        ).join("?");
        const values = Array.isArray(query)
          ? parameters
          : ((query as { values?: unknown[] }).values ?? []);
        if (sql.includes("FROM measurement_execution_bindings")) {
          const task = tasks.find((candidate) => candidate.rankCheckId === values[2]);
          if (!task || missingBindings.has(task.id)) return [];
          const source = retainedSourceFixture(task.keyword.projectId, task.keywordId);
          const head = definitionHeadFixture(source);
          return [
            {
              id: `binding-${task.id}`,
              projectId: source.projectId,
              keywordId: source.keywordId,
              targetRevision: head.targetRevision,
              policyRevision: head.policyRevision,
              owner: {
                rankCheckId: task.rankCheckId,
                executionKey: `queued-definition:${task.id}`,
                queuedTaskId: task.id,
              },
              source,
              request: frozenRequest(source, "dataforseo"),
              capturedAt: new Date("2026-06-01T00:00:00Z"),
            },
          ];
        }
        if (
          sql.trimStart().startsWith('SELECT "id"') &&
          sql.includes('FROM "queued_rank_check_tasks"')
        ) {
          const task = tasks.find((candidate) => candidate.id === String(values[0]));
          return task &&
            task.state === "persisting" &&
            task.persistenceLeaseOwner === values[1] &&
            task.persistenceLeaseExpiresAt &&
            task.persistenceLeaseExpiresAt > new Date()
            ? [{ id: task.id }]
            : [];
        }
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
      },
    ),
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    queuedRankCheckBatch: {
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => ({ state: "submitted" })),
    },
    queuedRankCheckTask: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(
        async (args: {
          where: {
            state?: string | { in: string[] };
            updatedAt?: { lt: Date };
            id?: { notIn: string[] };
          };
          take?: number;
        }) => {
          const state = args.where.state;
          if (state === "submitted")
            return tasks
              .filter(
                (task) =>
                  task.state === "submitted" && !(args.where.id?.notIn ?? []).includes(task.id),
              )
              .slice(0, args.take)
              .map((task) => ({
                ...task,
                providerTag: (task as Task & { providerTag?: string }).providerTag ?? null,
              }));
          if (!state)
            return tasks.map((task) => ({
              ...task,
              providerTag: (task as Task & { providerTag?: string }).providerTag ?? null,
            }));
          return tasks
            .filter((task) => typeof state === "object" && state.in.includes(task.state))
            .map((task) => ({ id: task.id }));
        },
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
    admission: vi.fn(),
    recoverOwn: vi.fn(),
    recoverHosted: vi.fn(),
    ready: vi.fn(),
    consumeProviderLimit: vi.fn(),
    defer: vi.fn(),
    fetchResult: vi.fn(),
    readFailures: new Map<string, QueuedSourceEvidenceReason>(),
    retainFailures: new Map<string, QueuedSourceEvidenceReason>(),
    missingBindings,
    finalizeEvidence: vi.fn(async (_tx: unknown, _taskId: string, _state: string) => undefined),
    sources: new Map<string, { data: unknown; sourceHash: string }>(),
    progress: new Map<string, QueuedResolutionProgress>(),
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

vi.mock("./queued-source-evidence", async (original) => {
  const actual = await original<typeof import("./queued-source-evidence")>();
  return {
    ...actual,
    readQueuedSource: async (identity: { taskId: string }) => {
      const failure = mocks.readFailures.get(identity.taskId);
      // An unclassified store error must be wrapped as the transient reason.
      if (failure === "store_unavailable") throw new Error("Synthetic connection reset.");
      if (failure) throw new actual.QueuedSourceEvidenceError(failure);
      return mocks.sources.get(identity.taskId) ?? null;
    },
    retainQueuedSource: async (identity: { taskId: string }, data: unknown) => {
      const failure = mocks.retainFailures.get(identity.taskId);
      if (failure) throw new actual.QueuedSourceEvidenceError(failure);
      mocks.sources.set(identity.taskId, { data, sourceHash: "source-hash" });
      return "source-hash";
    },
    readQueuedResolution: async (identity: { taskId: string }) =>
      mocks.progress.get(identity.taskId) ?? null,
    retainQueuedResolution: async (
      identity: { taskId: string },
      _hash: string,
      progress: QueuedResolutionProgress,
    ) => {
      mocks.progress.set(identity.taskId, progress);
    },
  };
});
vi.mock("./queued-source-retention", () => ({
  finalizeQueuedSourceEvidence: mocks.finalizeEvidence,
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: mocks.resolveCredentials,
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: mocks.consumeProviderLimit,
  writeCooldown: mocks.writeCooldown,
}));
vi.mock("@/lib/providers/serp/dataforseo-queued", () => ({
  legacyDataForSeoQueuedTaskTag: (id: string) => `bisibility:rank:${id}`,
  readyDataForSeoQueuedTasks: mocks.ready,
  dataForSeoQueuedTaskTag: (id: string) => `bisibility:rank:${id}`,
  fetchDataForSeoQueuedResult: async (...args: [unknown, string, unknown]) => {
    const data = await mocks.fetchResult(...args);
    return {
      ...data,
      tasks: data.tasks?.map((task: { id?: string }) => ({ ...task, id: task.id ?? args[1] })),
    };
  },
}));
vi.mock("@/lib/providers/execution-extension", async (original) => ({
  ...(await original<typeof import("@/lib/providers/execution-extension")>()),
  recoverQueuedDeploymentExecution: mocks.recoverHosted,
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
    mocks.readFailures.clear();
    mocks.retainFailures.clear();
    mocks.missingBindings.clear();
    mocks.sources.clear();
    mocks.progress.clear();
    mocks.tasks.splice(
      0,
      mocks.tasks.length,
      mocks.makeTask("success", "persisting", null),
      mocks.makeTask("failure", "provider_failed", "one task was rejected"),
    );
    mocks.admission.mockResolvedValue(false);
    mocks.recoverHosted.mockResolvedValue(null);
    mocks.ready.mockResolvedValue([]);
    mocks.prisma.queuedRankCheckBatch.findUniqueOrThrow.mockImplementation(async () => ({
      connection: mocks.tasks[0].batch.connection,
      projectId: "project_1",
      state: "submitted",
      tasks: mocks.tasks.map((task) => ({
        ...task,
        providerTag: (task as typeof task & { providerTag?: string }).providerTag ?? null,
      })),
    }));
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

  it.each(["foreign task", "multiple tasks"])(
    "rejects a mismatched source: %s",
    async (scenario) => {
      mocks.tasks.splice(1);
      const native = {
        id: scenario === "foreign task" ? "foreign" : mocks.tasks[0].providerTaskId,
        status_code: 20000,
        cost: 0,
        result: [],
      };
      mocks.fetchResult.mockResolvedValue({
        status_code: 20000,
        tasks: scenario === "multiple tasks" ? [native, native] : [native],
      });
      await persistReadyQueuedRankCheckTasks("batch_1");
      expect(mocks.sources.size).toBe(0);
      expect(mocks.persistRankCheck).not.toHaveBeenCalled();
      expect(mocks.persistFailed).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Queued result identity does not match." }),
      );
    },
  );

  function useRedirectSource(items?: unknown[]) {
    mocks.tasks.splice(1);
    const fixture = structuredClone(redirectFixture.tasks[0]);
    if (items) fixture.result[0].items = items as (typeof fixture.result)[0]["items"];
    mocks.fetchResult.mockResolvedValue({
      status_code: 20000,
      tasks: [{ ...fixture, id: mocks.tasks[0].providerTaskId }],
    });
  }

  function stubConverter(...responses: Array<() => Promise<Response>>) {
    const fetchMock = vi.fn(
      (_url: string, _init: RequestInit): Promise<Response> =>
        Promise.reject(new Error("Unexpected request")),
    );
    for (const response of responses) fetchMock.mockImplementationOnce(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const converterOk = () =>
    Promise.resolve(new Response(JSON.stringify(converterFixture.response), { status: 200 }));
  const converterDown = () => Promise.resolve(new Response("{}", { status: 503 }));

  it("defers only the task whose evidence store is unavailable and continues the batch", async () => {
    mocks.readFailures.set("success", "store_unavailable");
    await expect(persistReadyQueuedRankCheckTasks("batch_1")).resolves.toMatchObject({
      completed: 1,
    });
    expect(mocks.tasks[0].state).toBe("ready");
    expect(mocks.fetchResult).not.toHaveBeenCalled();
    expect(mocks.persistRankCheck).not.toHaveBeenCalled();
    expect(mocks.persistFailed).toHaveBeenCalledOnce();
    expect(mocks.persistFailed).toHaveBeenCalledWith(
      expect.objectContaining({ existingRankCheckId: "rank_check_failure" }),
    );
    expect(mocks.finalize).toHaveBeenCalledOnce();
  });

  it.each(["identity_mismatch", "unreadable", "conflict", "oversize"] as const)(
    "fails only the affected task on a permanent %s source error",
    async (reason) => {
      mocks.readFailures.set("success", reason);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      await expect(persistReadyQueuedRankCheckTasks("batch_1")).resolves.toBeDefined();
      expect(mocks.persistRankCheck).not.toHaveBeenCalled();
      expect(mocks.persistFailed).toHaveBeenCalledTimes(2);
      // The stored error is public API text: neutral wording with a stable code.
      expect(mocks.persistFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "The provider result could not be processed safely.",
          errorCode: "provider_result_unusable",
          existingRankCheckId: "rank_check_success",
        }),
      );
      expect(JSON.stringify(mocks.persistFailed.mock.calls)).not.toContain(reason);
      expect(warn).toHaveBeenCalledWith("[queued-rank-check] retained source unusable", {
        reason,
        taskId: "success",
      });
      warn.mockRestore();
      expect(mocks.tasks.map((task) => task.state)).toEqual(["failed", "failed"]);
      expect(mocks.finalize).toHaveBeenCalledOnce();
    },
  );

  it("retains a source whose text shows the account login but fails closed on a secret", async () => {
    mocks.tasks.splice(1);
    mocks.resolveCredentials.mockReturnValue({
      login: "support@example.com",
      password: "synthetic-secret-value",
    });
    const item = (title: string) => ({
      domain: "example.com",
      rank_group: 1,
      title,
      type: "organic",
      url: "https://example.com/page",
    });
    mocks.fetchResult.mockResolvedValueOnce({
      status_code: 20000,
      tasks: [
        { cost: 0.012, status_code: 20000, result: [{ items: [item("support@example.com")] }] },
      ],
    });
    await persistReadyQueuedRankCheckTasks("batch_1");
    expect(mocks.sources.size).toBe(1);
    expect(mocks.persistRankCheck).toHaveBeenCalledOnce();

    for (const secret of [
      "synthetic-secret-value",
      Buffer.from("support@example.com:synthetic-secret-value").toString("base64"),
    ]) {
      vi.clearAllMocks();
      mocks.sources.clear();
      mocks.tasks.splice(0, 1, mocks.makeTask("success", "persisting", null));
      mocks.fetchResult.mockResolvedValueOnce({
        status_code: 20000,
        tasks: [{ cost: 0.012, status_code: 20000, result: [{ items: [item(secret)] }] }],
      });
      await persistReadyQueuedRankCheckTasks("batch_1");
      expect(mocks.sources.size).toBe(0);
      expect(mocks.persistRankCheck).not.toHaveBeenCalled();
      expect(mocks.persistFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "The provider result could not be processed safely.",
          errorCode: "provider_result_unusable",
        }),
      );
    }
  });

  it("decides an oversized source in memory when no conversion needs it", async () => {
    mocks.tasks.splice(1);
    mocks.retainFailures.set("success", "oversize");
    await persistReadyQueuedRankCheckTasks("batch_1");
    expect(mocks.sources.size).toBe(0);
    expect(mocks.persistFailed).not.toHaveBeenCalled();
    expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
    expect(mocks.persistRankCheck.mock.calls[0]?.[1].rankCheck).toMatchObject({ position: 3 });
  });

  it("fails an oversized source that a conversion would need, without a converter call", async () => {
    useRedirectSource();
    mocks.retainFailures.set("success", "oversize");
    const fetchMock = stubConverter();
    try {
      await persistReadyQueuedRankCheckTasks("batch_1");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.persistRankCheck).not.toHaveBeenCalled();
      expect(mocks.persistFailed).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: "provider_result_unusable" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(["own", "hosted"])(
    "settles usage before failing a result that cannot be retained (%s)",
    async (kind) => {
      mocks.tasks.splice(1);
      const task = mocks.tasks[0];
      if (kind === "hosted") {
        task.batch.connection.credentialSource = "hosted";
        Object.assign(task, { providerTag: "tag;cs=hosted;" });
      }
      const recovery = {
        credentials: { login: "fixture-login", password: "fixture-password" },
        assertRetrieval: vi.fn(),
        knownCost: vi.fn(async () => 0.12),
        settleTask: vi.fn(async () => 0.12),
      };
      mocks.recoverHosted.mockResolvedValue(kind === "hosted" ? recovery : null);
      mocks.admission.mockResolvedValue(kind === "own");
      mocks.fetchResult.mockResolvedValue({
        status_code: 20000,
        tasks: [
          {
            id: task.providerTaskId,
            cost: 0.0012,
            status_code: 20000,
            result: [
              {
                items: [
                  {
                    domain: "example.com",
                    rank_group: 1,
                    title: "Synthetic password fixture-password",
                    type: "organic",
                    url: "https://example.com/page",
                  },
                ],
              },
            ],
          },
        ],
      });
      await persistReadyQueuedRankCheckTasks("batch_1");
      expect(mocks.sources.size).toBe(0);
      if (kind === "own")
        expect(mocks.recoverOwn).toHaveBeenCalledExactlyOnceWith(
          expect.anything(),
          "connection_1",
          "success",
          expect.objectContaining({ failed: false }),
        );
      else
        expect(recovery.settleTask).toHaveBeenCalledExactlyOnceWith(
          "success",
          expect.objectContaining({ failed: false }),
        );
      expect(mocks.persistFailed).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: "provider_result_unusable" }),
      );
      expect(task.state).toBe("failed");
    },
  );

  it("retrieves a failed provider task even when its definition binding is missing", async () => {
    mocks.tasks.splice(1);
    mocks.missingBindings.add("success");
    mocks.fetchResult.mockResolvedValue({
      status_code: 20000,
      tasks: [{ cost: 0.0024, status_code: 40501, status_message: "Invalid field.", result: null }],
    });
    await persistReadyQueuedRankCheckTasks("batch_1");
    expect(mocks.fetchResult).toHaveBeenCalledOnce();
    expect(mocks.persistFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Invalid field.",
        existingRankCheckId: "rank_check_success",
      }),
    );
    expect(mocks.tasks[0].state).toBe("failed");
  });

  it("decides without conversion when the match precedes every redirect row", async () => {
    // Drop the leading redirect row: the target now ranks ahead of every remaining one.
    const items = structuredClone(redirectFixture.tasks[0].result[0].items).filter(
      (item) => item.url !== "https://google.com/goto?url=SYNTHGOTO001",
    );
    const target = items.find((item) => item.url === "https://site1.example.com/page-1");
    if (!target) throw new Error("Fixture row is missing.");
    Object.assign(target, { domain: "example.com", url: "https://example.com/page-1" });
    useRedirectSource(items);
    const fetchMock = stubConverter();
    try {
      await persistReadyQueuedRankCheckTasks("batch_1");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
      expect(mocks.persistRankCheck.mock.calls[0]?.[1].rankCheck).toMatchObject({ position: 2 });
      expect(mocks.finalizeEvidence).toHaveBeenCalledWith(mocks.prisma, "success", "completed");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(["server error", "timeout"])(
    "retries conversion from retained source after %s",
    async (failure) => {
      useRedirectSource();
      const fetchMock = stubConverter(
        failure === "timeout"
          ? () => Promise.reject(new DOMException("Timeout", "TimeoutError"))
          : converterDown,
        converterOk,
      );
      try {
        for (let pass = 0; pass < 4; pass += 1) await persistReadyQueuedRankCheckTasks("batch_1");
        expect(mocks.fetchResult).toHaveBeenCalledOnce();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(
          fetchMock.mock.calls.every(([url]) =>
            String(url).endsWith("/appendix/goto_url_converter"),
          ),
        ).toBe(true);
        expect(mocks.progress.get("success")).toMatchObject({ attempts: 2, sequence: 2 });
        expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
        expect(
          mocks.persistRankCheck.mock.calls[0]?.[1].rankCheck.raw.redirect_resolutions,
        ).toEqual(expect.arrayContaining([expect.objectContaining({ status: "resolved" })]));
        expect(mocks.finalizeEvidence).toHaveBeenCalledWith(mocks.prisma, "success", "completed");
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("retains partial mappings and retries only unresolved URLs", async () => {
    useRedirectSource();
    const firstMapping = converterFixture.response.tasks[0].result[0];
    const partialResponse = {
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [firstMapping] }],
    };
    const fetchMock = stubConverter(
      () => Promise.resolve(new Response(JSON.stringify(partialResponse), { status: 200 })),
      converterOk,
    );
    try {
      for (let pass = 0; pass < 4; pass += 1) await persistReadyQueuedRankCheckTasks("batch_1");
      const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
      expect(secondBody[0].goto_urls).not.toContain(firstMapping.goto);
      expect(secondBody[0].goto_urls).toHaveLength(14);
      expect(mocks.fetchResult).toHaveBeenCalledOnce();
      expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps mappings from a cancelled conversion without spending an attempt", async () => {
    mocks.tasks.splice(1);
    const items = Array.from({ length: 101 }, (_, index) => ({
      type: "organic",
      rank_group: index + 1,
      domain: "google.com",
      url: `https://google.com/goto?url=synthetic-${index}`,
    }));
    mocks.fetchResult.mockResolvedValue({
      status_code: 20000,
      tasks: [
        {
          id: mocks.tasks[0].providerTaskId,
          status_code: 20000,
          cost: 0.0012,
          result: [{ items }],
        },
      ],
    });
    const controller = new AbortController();
    const cancellation = new Error("Cancelled fixture");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const urls = JSON.parse(String(init.body))[0].goto_urls as string[];
      if (urls.length === 1) {
        controller.abort(cancellation);
        throw cancellation;
      }
      return new Response(
        JSON.stringify({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              result: urls.map((goto) => ({ goto, url: "https://example.org/page" })),
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await persistReadyQueuedRankCheckTasks("batch_1");
      await expect(
        persistReadyQueuedRankCheckTasks("batch_1", { signal: controller.signal }),
      ).rejects.toBe(cancellation);
      const progress = mocks.progress.get(mocks.tasks[0].id);
      expect(Object.keys(progress?.mappings ?? {})).toHaveLength(100);
      expect(progress).toMatchObject({ attempts: 0, sequence: 1 });
      expect(mocks.tasks[0].state).toBe("ready");
      expect(mocks.persistFailed).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not count repeated cancellations as converter failures", async () => {
    useRedirectSource();
    const cancellation = new Error("Activity cancelled");
    let controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => {
      controller.abort(cancellation);
      throw cancellation;
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await persistReadyQueuedRankCheckTasks("batch_1");
      for (let pass = 0; pass < 4; pass += 1) {
        controller = new AbortController();
        await expect(
          persistReadyQueuedRankCheckTasks("batch_1", { signal: controller.signal }),
        ).rejects.toBe(cancellation);
      }
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(mocks.progress.has("success")).toBe(false);
      fetchMock.mockImplementation(converterOk);
      await persistReadyQueuedRankCheckTasks("batch_1");
      await persistReadyQueuedRankCheckTasks("batch_1");
      expect(mocks.persistFailed).not.toHaveBeenCalled();
      expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns pending instead of starting a conversion the activity cannot finish", async () => {
    useRedirectSource();
    const fetchMock = stubConverter(converterOk);
    try {
      await persistReadyQueuedRankCheckTasks("batch_1");
      for (const remaining of [30_000, 70_000])
        await persistReadyQueuedRankCheckTasks("batch_1", {
          activityDeadlineAt: new Date(Date.now() + remaining),
        });
      // 70 s would leave 45 s: a cut-down timeout could spend an attempt, so do not start.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.tasks[0].state).toBe("ready");
      expect(mocks.progress.has("success")).toBe(false);
      expect(mocks.persistFailed).not.toHaveBeenCalled();
      await persistReadyQueuedRankCheckTasks("batch_1", {
        activityDeadlineAt: new Date(Date.now() + 120_000),
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("persists the unresolved redirect code after three failed conversions", async () => {
    useRedirectSource();
    const fetchMock = vi.fn(converterDown);
    vi.stubGlobal("fetch", fetchMock);
    try {
      for (let attempt = 0; attempt < 5; attempt += 1)
        await persistReadyQueuedRankCheckTasks("batch_1");
      expect(mocks.fetchResult).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(mocks.persistRankCheck).not.toHaveBeenCalled();
      expect(mocks.persistFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: "provider_unresolved_redirects",
          raw: {
            redirect_resolutions: expect.arrayContaining([
              expect.objectContaining({
                originalUrl: "https://google.com/goto?url=SYNTHGOTO001",
                status: "unresolved",
              }),
            ]),
          },
        }),
      );
      expect(mocks.finalizeEvidence).toHaveBeenCalledWith(mocks.prisma, "success", "failed");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails without conversion when only an unconvertible redirect keeps the result open", async () => {
    const items = structuredClone(redirectFixture.tasks[0].result[0].items).map((item) =>
      typeof item.url === "string" && item.url.startsWith("https://google.com/goto")
        ? { ...item, url: item.url.replace("https://", "http://") }
        : item,
    );
    useRedirectSource(items);
    const fetchMock = stubConverter();
    try {
      await persistReadyQueuedRankCheckTasks("batch_1");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocks.persistFailed).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: "provider_unresolved_redirects" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(["found", "absent", "indeterminate", "empty"])(
    "handles partial results when the domain is %s",
    async (scenario) => {
      mocks.tasks.splice(1);
      const items =
        scenario === "empty"
          ? []
          : Array.from({ length: 10 }, (_, index) => ({
              type: "organic",
              rank_group: index + 1,
              rank_absolute: index + 1,
              domain:
                (scenario === "found" || scenario === "indeterminate") && index === 6
                  ? "example.com"
                  : "other.test",
              url:
                (scenario === "found" || scenario === "indeterminate") && index === 6
                  ? "https://example.com/rank"
                  : `https://other.test/${index}`,
            }));
      if (scenario === "indeterminate") items[6].rank_group = 0;
      mocks.tasks[0].costCents = 0.24;
      mocks.fetchResult.mockResolvedValue({
        status_code: 20000,
        tasks: [
          {
            status_code: 40106,
            cost: 0.0012,
            status_message: "partial",
            data: { stop_crawl_on_match: [] },
            result: [{ items }],
          },
        ],
      });
      await persistReadyQueuedRankCheckTasks("batch_1");
      if (scenario === "found" || scenario === "absent") {
        expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
        expect(mocks.persistRankCheck.mock.calls[0]?.[1]).toMatchObject({
          rankCheck: {
            position: scenario === "found" ? 7 : null,
            requestedDepth: 20,
            costCents: 0.12,
            observation: { completeness: "unknown" },
            raw: {
              provider_response: expect.objectContaining({
                status_code: 20000,
                tasks: expect.any(Array),
              }),
              organic_results: expect.arrayContaining([
                expect.objectContaining({ domain: "other.test" }),
              ]),
            },
          },
          providerCostCents: 0.12,
        });
        expect(mocks.persistFailed).not.toHaveBeenCalled();
      } else {
        expect(mocks.persistRankCheck).not.toHaveBeenCalled();
        expect(mocks.persistFailed).toHaveBeenCalledOnce();
        expect(mocks.persistFailed).toHaveBeenCalledWith(
          expect.objectContaining({
            providerCostCents: 0.12,
            error:
              scenario === "empty"
                ? "partial"
                : "DataForSEO returned partial results (10 organic items); the domain was not found in the retrieved results.",
          }),
        );
      }
      await persistReadyQueuedRankCheckTasks("batch_1");
      expect(mocks.persistRankCheck.mock.calls.length + mocks.persistFailed.mock.calls.length).toBe(
        1,
      );
    },
  );

  it.each(["own", "hosted"])(
    "retrieves the incident through fallback and records actual cost once (%s)",
    async (kind) => {
      const task = mocks.makeTask("incident", "submitted", null, 0.24);
      Object.assign(task, {
        batchId: "batch_1",
        providerTag: kind === "hosted" ? "tag;cs=hosted;" : null,
      });
      if (kind === "hosted") task.batch.connection.credentialSource = "hosted";
      mocks.tasks.splice(0, mocks.tasks.length, task);
      const recovery = {
        credentials: { login: "fixture-login", password: "fixture-password" },
        reconcile: vi.fn(),
        bindReadyTask: vi.fn(),
        assertRetrieval: vi.fn(),
        settleTask: vi.fn(async () => 0.12),
        finish: vi.fn(),
      };
      mocks.recoverHosted.mockResolvedValue(kind === "hosted" ? recovery : null);
      mocks.admission.mockResolvedValue(kind === "own");
      const items = Array.from({ length: 10 }, (_, index) => ({
        type: "organic",
        rank_group: index + 1,
        rank_absolute: index + 1,
        domain: index === 6 ? "example.com" : "other.test",
        url: index === 6 ? "https://example.com/rank" : `https://other.test/${index}`,
      }));
      mocks.fetchResult.mockResolvedValue({
        status_code: 20000,
        tasks: [{ id: task.providerTaskId, status_code: 40106, cost: 0.0012, result: [{ items }] }],
      });
      await inspectQueuedRankCheckBatch("batch_1");
      expect(task.state).toBe("ready");
      expect(mocks.recoverOwn).not.toHaveBeenCalled();
      expect(recovery.settleTask).not.toHaveBeenCalled();
      await persistReadyQueuedRankCheckTasks("batch_1");
      await persistReadyQueuedRankCheckTasks("batch_1");
      expect(mocks.fetchResult).toHaveBeenCalledTimes(2);
      expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
      expect(mocks.persistRankCheck.mock.calls[0]?.[1]).toMatchObject({
        rankCheck: { position: 7, costCents: 0.12 },
        providerCostCents: 0.12,
      });
      if (kind === "own")
        expect(mocks.recoverOwn).toHaveBeenCalledExactlyOnceWith(
          expect.anything(),
          "connection_1",
          "incident",
          expect.objectContaining({ costCents: 0.12, failed: false }),
        );
      else
        expect(recovery.settleTask).toHaveBeenCalledExactlyOnceWith(
          "incident",
          expect.objectContaining({ costCents: 0.12, failed: false }),
        );
    },
  );

  it.each(["own", "hosted"])("settles a partial domain miss once as failed (%s)", async (kind) => {
    const task = mocks.makeTask("miss", "ready", null, 0.24);
    Object.assign(task, {
      batchId: "batch_1",
      providerTag: kind === "hosted" ? "tag;cs=hosted;" : null,
    });
    if (kind === "hosted") task.batch.connection.credentialSource = "hosted";
    mocks.tasks.splice(0, mocks.tasks.length, task);
    const recovery = {
      credentials: {},
      assertRetrieval: vi.fn(),
      settleTask: vi.fn(async () => 0.12),
      knownCost: vi.fn(async () => 0.12),
    };
    mocks.recoverHosted.mockResolvedValue(kind === "hosted" ? recovery : null);
    mocks.admission.mockResolvedValue(kind === "own");
    mocks.fetchResult.mockResolvedValue({
      status_code: 20000,
      tasks: [
        {
          id: task.providerTaskId,
          status_code: 40106,
          cost: 0.0012,
          result: [
            {
              items: [
                {
                  type: "organic",
                  rank_group: 1,
                  domain: "other.test",
                  url: "https://other.test/",
                },
              ],
            },
          ],
        },
      ],
    });
    await persistReadyQueuedRankCheckTasks("batch_1");
    await persistReadyQueuedRankCheckTasks("batch_1");
    expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
    expect(mocks.persistFailed).not.toHaveBeenCalled();
    if (kind === "own")
      expect(mocks.recoverOwn).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        "connection_1",
        "miss",
        expect.objectContaining({ costCents: 0.12, failed: true }),
      );
    else
      expect(recovery.settleTask).toHaveBeenCalledExactlyOnceWith(
        "miss",
        expect.objectContaining({ costCents: 0.12, failed: true }),
      );
  });

  it.each([0, 0.725, null])(
    "retains estimate %s without inferring a free submission from retrieval",
    async (estimate) => {
      mocks.tasks.splice(1);
      mocks.tasks[0].costCents = null;
      mocks.tasks[0].rankCheck.estimatedCostCents = estimate;
      mocks.fetchResult.mockResolvedValue({
        status_code: 20000,
        cost: 0,
        tasks: [{ status_code: 20000, cost: 0, result: [{ items: [] }] }],
      });
      await persistReadyQueuedRankCheckTasks("batch_1");
      expect(mocks.persistRankCheck.mock.calls[0]?.[1]).toMatchObject({
        rankCheck: { costCents: null, billingUnits: 1, estimatedCostCents: estimate },
        providerCostCents: undefined,
      });
    },
  );

  it("never retrieves with a retained own key when hosted recovery evidence is absent", async () => {
    const task = mocks.makeTask("hosted-retained", "ready", null);
    task.batch.connection.credentialSource = "hosted";
    mocks.tasks.splice(0, mocks.tasks.length, task);
    await persistReadyQueuedRankCheckTasks("batch_1");
    expect(mocks.resolveCredentials).not.toHaveBeenCalled();
    expect(mocks.fetchResult).not.toHaveBeenCalled();
  });

  it("denies movement comparison when the original result has no scope/time proof", async () => {
    mocks.tasks.splice(1);
    await persistReadyQueuedRankCheckTasks("batch_1");
    expect(mocks.persistRankCheck.mock.calls[0]?.[1]).toMatchObject({ comparisonAllowed: false });
    expect(mocks.prisma.rankCheck.findFirst).not.toHaveBeenCalled();
  });
  it("uses the retained request domain after the project's current domain changes", async () => {
    mocks.tasks.splice(1);
    mocks.tasks[0].keyword.project.domain = "changed.example.com";
    await persistReadyQueuedRankCheckTasks("batch_1");
    expect(mocks.persistRankCheck).toHaveBeenCalledOnce();
    expect(mocks.persistRankCheck.mock.calls[0]?.[1]).toMatchObject({
      comparisonAllowed: false,
      rankCheck: { position: 3, rankingUrl: "https://example.com/new" },
    });
  });

  it("looks up only the retained target predecessor when response scope and time are proven", async () => {
    mocks.tasks.splice(1);
    mocks.fetchResult.mockResolvedValue({
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          cost: 0.012,
          data: {
            location_name: "Synthetic",
            language_code: "en",
            device: "desktop",
            stop_crawl_on_match: [],
          },
          result: [
            {
              datetime: new Date().toISOString(),
              location_name: "Synthetic",
              language_code: "en",
              device: "desktop",
              items: [
                {
                  type: "organic",
                  domain: "example.com",
                  rank_group: 3,
                  rank_absolute: 4,
                  url: "https://example.com/new",
                },
              ],
            },
          ],
        },
      ],
    });
    await persistReadyQueuedRankCheckTasks("batch_1");
    expect(mocks.prisma.rankCheck.findFirst).toHaveBeenCalledWith({
      include: { observationRun: true },
      orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
      where: {
        keywordId: "keyword_success",
        status: "completed",
        id: { not: "rank_check_success" },
      },
    });
    // The previous row itself remains legacy unknown, despite the current response proof.
    expect(mocks.persistRankCheck.mock.calls[0]?.[1]).toMatchObject({ comparisonAllowed: false });
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
      // The retained predecessor has a rank only, without immutable scope/quality proof.
      comparisonAllowed: false,
      rankCheck: {
        billingUnits: 1,
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
    // No scope echo or observation time: a legacy rank cannot become a comparable baseline.
    expect(mocks.prisma.rankCheck.findFirst).not.toHaveBeenCalled();
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

  it("persists results under the batch's stored source, trigger and credential", async () => {
    mocks.tasks.splice(0, mocks.tasks.length, mocks.makeTask("success", "ready", null));
    Object.assign(mocks.tasks[0].batch, {
      credentialId: "key_1",
      credentialKind: "project_key",
      source: "api",
      trigger: "manual",
    });

    await persistReadyQueuedRankCheckTasks("batch_1");

    expect(mocks.persistRankCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        providerUsage: expect.objectContaining({
          context: expect.objectContaining({ source: "api", trigger: "manual" }),
          credential: { id: "key_1", kind: "project_key" },
        }),
      }),
      expect.anything(),
    );
  });

  it("attributes a legacy batch without stored columns to app/scheduled with no credential", async () => {
    mocks.tasks.splice(0, mocks.tasks.length, mocks.makeTask("failure", "provider_failed", "boom"));

    await persistReadyQueuedRankCheckTasks("batch_1");

    const usage = mocks.persistFailed.mock.calls[0]?.[0].providerUsage;
    expect(usage.context).toEqual({
      correlationId: "failure",
      feature: "rank_check",
      projectId: "project_1",
      source: "app",
      trigger: "scheduled",
    });
    expect(usage.credential).toBeUndefined();
  });

  it("persists a billable empty SERP without failing or retrying the task", async () => {
    mocks.tasks.splice(0, mocks.tasks.length, mocks.makeTask("empty", "ready", null));
    mocks.fetchResult.mockResolvedValue({
      status_code: 20000,
      tasks: [{ status_code: 40102, cost: 0.002, result: [{ items: null }] }],
    });
    await persistReadyQueuedRankCheckTasks("batch_1");
    expect(mocks.persistFailed).not.toHaveBeenCalled();
    expect(mocks.persistRankCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rankCheck: expect.objectContaining({ position: null, rankingUrl: null, costCents: 0.2 }),
      }),
    );
    expect(mocks.tasks[0]?.state).toBe("completed");
    expect(mocks.fetchResult).toHaveBeenCalledOnce();
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

vi.mock("@/lib/provider-usage/admission-extension", async () => ({
  ownAdmission: {
    ...(await import("@/lib/provider-usage/byok-test-evidence")).testOwnAdmission,
    assertRetrieval: mocks.admission,
    recover: mocks.recoverOwn,
  },
}));
