import { Context } from "@temporalio/activity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  admittedDefinitionSourceFixture,
  definitionQueryFixture,
} from "./definition-policy.test-fixture";
import { claimDueRankCheckItems } from "./items-claim";
import { prepareQueuedRankCheckBatch } from "./queued-prepare";

const mocks = vi.hoisted(() => {
  const state = {
    batches: [] as Array<Record<string, unknown>>,
    item: {
      claimExpiresAt: new Date("2026-09-02T08:05:00.000Z") as Date | null,
      claimAttempts: 1,
      id: "item_1",
      keywordId: "keyword_1",
      rankCheckId: null as string | null,
      runId: "run_1",
      status: "running",
    },
    rankChecks: [] as Array<Record<string, unknown>>,
    run: {
      credentialId: null as string | null,
      credentialKind: null as string | null,
      source: null as string | null,
      trigger: "scheduled" as string,
    },
    tasks: [] as Array<Record<string, unknown>>,
  };
  const providerFacingCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    state.tasks.push(data);
    return data;
  });
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone(state);
      try {
        return await callback(prisma);
      } catch (error) {
        state.batches = snapshot.batches;
        state.item = snapshot.item;
        state.rankChecks = snapshot.rankChecks;
        state.tasks = snapshot.tasks;
        throw error;
      }
    }),
    $executeRaw: vi.fn(async (_query: unknown, ..._values: unknown[]) => 1),
    $queryRaw: vi.fn(async (_query: unknown, ..._values: unknown[]): Promise<unknown> => []),
    auditLog: { create: vi.fn(async () => ({ id: "audit_1" })) },
    keyword: {
      findMany: vi.fn(async () => [
        {
          archivedAt: null as Date | null,
          id: "keyword_1",
          text: "site:example.com",
          locationId: "location_active",
          locationRef: {},
          publicId: "kw_abcdefghijklmnopqrstuvwx",
          rankChecks: [],
          checkSchedule: {
            serpDepth: null,
            enabled: true,
            archivedAt: null,
            frequency: "daily",
          } as {
            serpDepth: number | null;
            enabled: boolean;
            archivedAt: Date | null;
            frequency: string;
          } | null,
          schedule: { frequency: "daily", serpDepth: 20 },
        },
      ]),
    },
    projectMarket: {
      findMany: vi.fn(async () => [{ locationId: "location_active" }]),
    },
    project: {
      findUnique: vi.fn(async () => ({
        budgetCapCents: null,
        defaults: { frequency: "daily", serpDepth: 20 },
        owner: { deactivatedAt: null },
        providerAllocationsInitializedAt: new Date(0),
        providerConnections: [
          {
            credentialsEncrypted: "encrypted",
            credentialSource: "own",
            id: "connection_1",
            provider: "dataforseo",
          },
        ],
        writeMode: "active",
      })),
    },
    queuedRankCheckBatch: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { createdAt: new Date("2026-09-02T08:00:00.000Z"), ...data };
        state.batches.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        state.batches.find((batch) => batch.id === where.id),
      ),
    },
    queuedRankCheckTask: { create: providerFacingCreate },
    rankCheck: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `rank_${state.rankChecks.length + 1}`, ...data };
        state.rankChecks.push(row);
        return row;
      }),
      findUniqueOrThrow: vi.fn(async () => ({ costCents: null })),
    },
    rankCheckRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.run = { ...state.run, ...data };
        state.item.claimAttempts = 0;
        state.item.claimExpiresAt = null;
        return { id: "run_1", items: [state.item] };
      }),
      findUnique: vi.fn(async () => state.run),
      update: vi.fn(async () => ({})),
    },
    rankCheckRunItem: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if ("id" in where) {
          const ids = (where.id as { in: string[] }).in;
          return ids.includes(state.item.id) ? [state.item] : [];
        }
        return where.runId === state.item.runId ? [state.item] : [];
      }),
      findUnique: vi.fn(async () => ({ runId: state.item.runId })),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: {
            id: string;
            keywordId: string;
            rankCheckId: null;
            status: string;
            claimAttempts: number;
            claimExpiresAt: Date | null;
          };
        }) => {
          if (
            where.id === state.item.id &&
            where.keywordId === state.item.keywordId &&
            where.rankCheckId === null &&
            where.status === state.item.status &&
            where.claimAttempts === state.item.claimAttempts &&
            where.claimExpiresAt?.getTime() === state.item.claimExpiresAt?.getTime() &&
            state.item.rankCheckId === null
          ) {
            Object.assign(state.item, data);
            return { count: 1 };
          }
          return { count: 0 };
        },
      ),
    },
  };
  return {
    assertQueuedRankCheckBatchAllocation: vi.fn(),
    nativeCosts: vi.fn(),
    prisma,
    providerFacingCreate,
    publishOperationChanged: vi.fn(() => Promise.resolve()),
    state,
  };
});

vi.mock("@/lib/rank-check/budget", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./budget")>()),
  assertBudgetAvailable: vi.fn(async () => ({ capCents: 5000, spentCents: 0 })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-rates/native-rank-request", () => ({
  loadNativeRankRequestCosts: mocks.nativeCosts,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./allocation-enforcement", () => ({
  assertQueuedRankCheckBatchAllocation: mocks.assertQueuedRankCheckBatchAllocation,
}));
vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: mocks.publishOperationChanged,
}));
vi.mock("@/lib/db/public-id", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/public-id")>()),
  makePublicId: () => "check_abcdefghijklmnopqrstuvwx",
}));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: () => ({ login: "login", password: "password" }),
}));

function queuedSourceFixture() {
  const source = admittedDefinitionSourceFixture("project_1", "keyword_1");
  source.target.text = "site:example.com";
  source.target.domain = "example.com";
  if (!source.policy.defaults) throw new Error("Synthetic defaults fixture is required.");
  source.policy.defaults.frequency = "daily";
  source.policy.defaults.serpDepth = 20;
  return source;
}
// Trusted semantic producer port only. Keep real queued permit admission and original request wiring.
vi.mock("@/lib/measurement-definitions/worker-session", async () => {
  const { assertDefinitionExecutionPermit } = await import(
    "@/lib/measurement-definitions/worker-claim"
  );
  const { frozenRequest } = await import("@/lib/measurement-definitions/canonical");
  return {
    captureWorkerDefinition: vi.fn(async (tx, input) => {
      assertDefinitionExecutionPermit(input.permit);
      expect(tx).toBe(mocks.prisma);
      expect(input.projectId).toBe("project_1");
      expect(input.keywordId).toBe("keyword_1");
      expect(input.connection).toMatchObject({ id: "connection_1", provider: "dataforseo" });
      expect(input.permit.principal).toMatchObject({ runId: "run_1", runItemId: "item_1" });
      expect(mocks.state.tasks).toContainEqual(
        expect.objectContaining({ id: input.queuedTaskId, rankCheckId: input.permit.rankCheckId }),
      );
      return {
        binding: { request: frozenRequest(queuedSourceFixture(), "dataforseo", input.depth) },
      };
    }),
  };
});

const baseInput = {
  batchId: "batch_1",
  claimedAt: "2026-09-02T08:00:00.000Z",
  chunkIndex: 0,
  device: "desktop",
  dispatchClaims: [
    {
      keywordId: "keyword_1",
      stateVersion: "1",
      dueCheckAt: "2026-09-02T07:00:00.000Z",
      advancedCheckAt: "2026-09-03T08:00:00.000Z",
    },
  ],
  runItemClaims: [{ id: "item_1", claimAttempts: 1, claimExpiresAt: "2026-09-02T08:05:00.000Z" }],
  keywordIds: ["keyword_1"],
  locationId: "location_1",
  projectId: "project_1",
  workflowRunId: "workflow_1",
};

function sqlText(query: unknown) {
  return String((query as { sql?: string })?.sql ?? "").replace(/\s+/g, " ");
}

describe("queued rank-check run-item preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Context, "current").mockReturnValue({
      info: {
        workflowExecution: {
          workflowId: "queued-fixture",
          runId: baseInput.workflowRunId,
        },
      },
    } as unknown as Context);
    vi.setSystemTime(new Date(baseInput.claimedAt));
    mocks.nativeCosts.mockResolvedValue([0.725]);
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "1");
    mocks.state.batches = [];
    mocks.state.item = {
      claimExpiresAt: new Date("2026-09-02T08:05:00.000Z"),
      claimAttempts: 1,
      id: "item_1",
      keywordId: "keyword_1",
      rankCheckId: null,
      runId: "run_1",
      status: "running",
    };
    mocks.state.rankChecks = [];
    mocks.state.run = {
      credentialId: null,
      credentialKind: null,
      source: null,
      trigger: "scheduled",
    };
    mocks.state.tasks = [];
    mocks.prisma.$executeRaw.mockImplementation(async (query: unknown, ...values: unknown[]) => {
      const parts = Array.isArray(query) ? query : (query as { strings: string[] }).strings;
      const sql = parts.join("?");
      if (sql.includes('UPDATE rank_checks SET "definitionExecutionToken"')) {
        const row = mocks.state.rankChecks.find((check) => check.id === values[2]);
        if (
          row?.status !== "running" ||
          row.workflowRunId !== values[3] ||
          row.definitionExecutionToken
        )
          return 0;
        row.definitionExecutionToken = values[0];
        row.definitionWorkflowId = values[1];
      }
      return 1;
    });
    const catalogQuery = definitionQueryFixture(async (query, ...values) => {
      const parts = Array.isArray(query) ? query : (query as { strings: string[] }).strings;
      const parameters = Array.isArray(query) ? values : (query as { values: unknown[] }).values;
      const sql = parts.join("?");
      if (sql.includes("FROM keyword_dispatch_states"))
        return parameters[0] === "keyword_1" && parameters[2] === "1" ? [{ id: "keyword_1" }] : [];
      if (sql.includes('SELECT i."definitionIntent" AS intent'))
        return [{ intent: { version: 1, depth: 20, source: queuedSourceFixture() } }];
      if (sql.includes('SELECT "definitionExecutionToken" AS token')) {
        const row = mocks.state.rankChecks.find((check) => check.id === parameters[0]);
        if (
          row?.status !== "running" ||
          row.workflowRunId !== parameters[1] ||
          row.definitionWorkflowId !== parameters[2] ||
          !row.definitionExecutionToken
        )
          return [];
        return [
          {
            token: row.definitionExecutionToken,
            principal: {
              actorId: null,
              runId: "run_1",
              runItemId: "item_1",
              source: mocks.state.run.source,
              trigger: mocks.state.run.trigger,
              credentialId: mocks.state.run.credentialId,
              credentialKind: mocks.state.run.credentialKind,
              selectionKind: "legacy_schedule",
              selectionHash: "a".repeat(64),
              checkScheduleId: null,
            },
          },
        ];
      }
      return [];
    });
    mocks.prisma.$queryRaw.mockImplementation(async (query: unknown, ...values: unknown[]) => {
      const parts = Array.isArray(query) ? query : (query as { strings: string[] }).strings;
      if (parts.join("?").includes("SELECT measurement_definition_source("))
        return [{ source: queuedSourceFixture() }];
      return catalogQuery(query as never, ...values);
    });
    mocks.assertQueuedRankCheckBatchAllocation.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each<[string, Array<{ locationId: string }>, Date | null, string, string]>([
    [
      "a paused market",
      [{ locationId: "location_other" }],
      null,
      "The market for these keywords is no longer active.",
      "market_inactive",
    ],
    [
      "an archived keyword",
      [{ locationId: "location_active" }],
      new Date("2026-09-01T06:00:00.000Z"),
      "The keyword was archived before the queued batch could start.",
      "keyword_archived",
    ],
  ])(
    "defers the batch and buys nothing for %s",
    async (_case, markets, archivedAt, reason, code) => {
      mocks.prisma.projectMarket.findMany.mockResolvedValueOnce(markets);
      mocks.prisma.keyword.findMany.mockResolvedValueOnce([
        {
          archivedAt,
          checkSchedule: null,
          id: "keyword_1",
          text: "site:example.com",
          locationId: "location_active",
          locationRef: {},
          publicId: "kw_abcdefghijklmnopqrstuvwx",
          rankChecks: [],
          schedule: { frequency: "daily", serpDepth: 20 },
        },
      ]);

      await expect(prepareQueuedRankCheckBatch(baseInput)).resolves.toMatchObject({
        state: "deferred",
      });

      expect(mocks.state.batches[0]).toMatchObject({ error: reason, state: "deferred" });
      expect(mocks.state.rankChecks[0]).toMatchObject({
        deferredReason: code,
        estimatedCostCents: null,
        status: "deferred",
      });
      expect(mocks.state.tasks[0]).toMatchObject({ error: reason, state: "deferred" });
    },
  );

  it("allows a manual API batch without membership only with its current owned run-item claim", async () => {
    const rows = await mocks.prisma.keyword.findMany();
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([
      { ...rows[0], checkSchedule: null, schedule: { frequency: "manual", serpDepth: 20 } },
    ]);
    mocks.state.run = {
      credentialId: "key_1",
      credentialKind: "project_key",
      source: "api",
      trigger: "api",
    };
    await expect(
      prepareQueuedRankCheckBatch({ ...baseInput, runId: "run_1", runItemIds: ["item_1"] }),
    ).resolves.toMatchObject({ state: "prepared" });
    expect(mocks.nativeCosts).toHaveBeenCalledOnce();
  });
  it("does not allow inherited daily intent to prepare automatic work without a claim or membership", async () => {
    const rows = await mocks.prisma.keyword.findMany();
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([{ ...rows[0], checkSchedule: null }]);
    await expect(prepareQueuedRankCheckBatch(baseInput)).resolves.toMatchObject({
      state: "deferred",
    });
    expect(mocks.nativeCosts).not.toHaveBeenCalled();
    expect(mocks.state.batches[0]).toMatchObject({
      error: "Keyword schedule no longer permits automatic work.",
    });
    expect(mocks.state.rankChecks[0]).toMatchObject({
      deferredReason: "schedule_ineligible",
      status: "deferred",
    });
  });
  it.each(["forged", "stale", "mismatched"])(
    "rejects %s run-item claims before any quote or preparation",
    async (kind) => {
      const input = {
        ...baseInput,
        runId: "run_1",
        runItemIds: ["item_1"],
        runItemClaims: baseInput.runItemClaims.map((claim) => ({
          ...claim,
          ...(kind === "forged"
            ? { id: "item_other" }
            : kind === "stale"
              ? { claimAttempts: 0 }
              : { claimExpiresAt: "2026-09-02T08:04:00.000Z" }),
        })),
      };
      await expect(prepareQueuedRankCheckBatch(input)).rejects.toThrow(
        "Original run-item claim changed before preparation.",
      );
      expect(mocks.nativeCosts).not.toHaveBeenCalled();
      expect(mocks.state.batches).toHaveLength(0);
    },
  );
  it("prepares the assigned schedule depth instead of a stale keyword override", async () => {
    const rows = await mocks.prisma.keyword.findMany();
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([
      {
        ...rows[0],
        checkSchedule: { serpDepth: null, enabled: true, archivedAt: null, frequency: "daily" },
        schedule: { frequency: "daily", serpDepth: 100 },
      },
    ]);
    await prepareQueuedRankCheckBatch(baseInput);
    expect(mocks.state.rankChecks[0]).toMatchObject({ requestedDepth: 20 });
    expect(mocks.state.rankChecks[0]).toMatchObject({ estimatedCostCents: 0.725 });
    expect(mocks.nativeCosts).toHaveBeenCalledWith(
      mocks.prisma,
      expect.objectContaining({ credentialSource: "own" }),
      [{ keyword: "site:example.com", depth: 20, priority: "high" }],
      expect.any(Date),
    );
  });

  it("defers an unpriced native request instead of falling back to the list price", async () => {
    mocks.nativeCosts.mockResolvedValueOnce([null]);
    await expect(prepareQueuedRankCheckBatch(baseInput)).resolves.toMatchObject({
      state: "deferred",
    });
    expect(mocks.state.rankChecks[0]).toMatchObject({
      deferredReason: "quote_unavailable",
      estimatedCostCents: null,
      status: "deferred",
    });
    expect(mocks.assertQueuedRankCheckBatchAllocation).not.toHaveBeenCalled();
  });

  it("attributes a dispatcher batch without a run to the app surface as scheduled", async () => {
    await prepareQueuedRankCheckBatch(baseInput);

    expect(mocks.state.batches[0]).toMatchObject({
      credentialId: null,
      credentialKind: null,
      source: "app",
      trigger: "scheduled",
    });
  });

  it("carries the launching run's origin onto a run batch", async () => {
    mocks.state.run = {
      credentialId: "pat_1",
      credentialKind: "personal_token",
      source: "sdk",
      trigger: "api",
    };

    await prepareQueuedRankCheckBatch({ ...baseInput, runId: "run_1", runItemIds: ["item_1"] });

    expect(mocks.state.batches[0]).toMatchObject({
      credentialId: "pat_1",
      credentialKind: "personal_token",
      source: "sdk",
      trigger: "manual",
    });
  });

  it("defers an API-launched batch when the programmatic allocation is exhausted", async () => {
    const { ProviderAllocationExhaustedError } = await import("@/lib/provider-usage/enforcement");
    mocks.state.run = {
      credentialId: "pat_1",
      credentialKind: "personal_token",
      source: "sdk",
      trigger: "api",
    };
    mocks.assertQueuedRankCheckBatchAllocation.mockRejectedValueOnce(
      new ProviderAllocationExhaustedError("connection_1", "programmatic"),
    );

    await expect(
      prepareQueuedRankCheckBatch({ ...baseInput, runId: "run_1", runItemIds: ["item_1"] }),
    ).resolves.toMatchObject({ state: "deferred" });

    expect(mocks.assertQueuedRankCheckBatchAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: expect.objectContaining({ id: "connection_1" }),
        projectId: "project_1",
        surface: "programmatic",
      }),
      mocks.prisma,
    );
    expect(mocks.state.batches[0]).toMatchObject({
      error: "budget_exhausted:programmatic",
      state: "deferred",
    });
    expect(mocks.state.rankChecks[0]).toMatchObject({
      deferredReason: "budget_exhausted:programmatic",
      status: "deferred",
    });
    expect(mocks.state.tasks[0]).toMatchObject({
      error: "budget_exhausted:programmatic",
      state: "deferred",
    });
  });

  it("prepares an API-launched batch when the programmatic allocation has room", async () => {
    mocks.state.run = {
      credentialId: null,
      credentialKind: null,
      source: "sdk",
      trigger: "api",
    };

    await expect(
      prepareQueuedRankCheckBatch({ ...baseInput, runId: "run_1", runItemIds: ["item_1"] }),
    ).resolves.toMatchObject({ state: "prepared" });

    expect(mocks.state.batches[0]).toMatchObject({ error: null, state: "prepared" });
    expect(mocks.assertQueuedRankCheckBatchAllocation).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "programmatic" }),
      mocks.prisma,
    );
  });

  it("keeps a dispatcher batch prepared on the same exhausted connection", async () => {
    const { ProviderAllocationExhaustedError } = await import("@/lib/provider-usage/enforcement");
    mocks.assertQueuedRankCheckBatchAllocation.mockRejectedValueOnce(
      new ProviderAllocationExhaustedError("connection_1", "programmatic"),
    );

    await expect(prepareQueuedRankCheckBatch(baseInput)).resolves.toMatchObject({
      state: "prepared",
    });

    expect(mocks.state.batches[0]).toMatchObject({ error: null, state: "prepared" });
    expect(mocks.state.rankChecks[0]).toMatchObject({ status: "running" });
    expect(mocks.assertQueuedRankCheckBatchAllocation).not.toHaveBeenCalled();
  });

  it("links legacy dispatcher input to an owned run without another paid reservation", async () => {
    await expect(prepareQueuedRankCheckBatch(baseInput)).resolves.toMatchObject({
      batchId: "batch_1",
      state: "prepared",
    });

    expect(mocks.prisma.rankCheckRunItem.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheckRunItem.updateMany).toHaveBeenCalledOnce();
    expect(mocks.prisma.rankCheckRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          selectionKind: "legacy_schedule",
          estimatedCostCents: 1,
          items: {
            create: [
              expect.objectContaining({
                definitionIntent: { version: 1, depth: 20, source: queuedSourceFixture() },
              }),
            ],
          },
        }),
      }),
    );
    expect(mocks.state.rankChecks).toHaveLength(1);
    expect(mocks.state.tasks).toHaveLength(1);
    expect(mocks.state.batches[0]).toMatchObject({ runId: "run_1" });
    expect(mocks.state.rankChecks[0]).toMatchObject({ runId: "run_1" });
    expect(mocks.publishOperationChanged).toHaveBeenCalledWith({ projectId: "project_1" });
  });

  it.each(["changed generation", "expired lease"])(
    "refuses %s before creating provider work",
    async (reason) => {
      if (reason === "expired lease") vi.setSystemTime(new Date("2026-09-02T08:06:00Z"));
      const input = {
        ...baseInput,
        runId: "run_1",
        runItemIds: ["item_1"],
        runItemClaims: baseInput.runItemClaims.map((claim) => ({
          ...claim,
          claimAttempts: reason === "changed generation" ? 2 : claim.claimAttempts,
        })),
      };
      await expect(prepareQueuedRankCheckBatch(input)).rejects.toThrow(
        "Original run-item claim changed before preparation",
      );
      expect(mocks.state.batches).toEqual([]);
      expect(mocks.state.rankChecks).toEqual([]);
      expect(mocks.providerFacingCreate).not.toHaveBeenCalled();
      expect(mocks.nativeCosts).not.toHaveBeenCalled();
    },
  );

  it("refuses legacy dispatch input without an actual advancement claim", async () => {
    const { dispatchClaims: _claims, ...input } = baseInput;
    await expect(prepareQueuedRankCheckBatch(input)).rejects.toThrow(
      "actual dispatcher advancement claims",
    );
    expect(mocks.state.batches).toEqual([]);
    expect(mocks.state.rankChecks).toEqual([]);
    expect(mocks.prisma.rankCheckRun.create).not.toHaveBeenCalled();
    expect(mocks.providerFacingCreate).not.toHaveBeenCalled();
  });

  it("rolls back the batch and check when the run-item CAS is lost after pricing", async () => {
    mocks.prisma.rankCheckRunItem.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      prepareQueuedRankCheckBatch({ ...baseInput, runId: "run_1", runItemIds: ["item_1"] }),
    ).rejects.toThrow("claim was lost before preparation");
    expect(mocks.nativeCosts).toHaveBeenCalledOnce();
    expect(mocks.state.batches).toEqual([]);
    expect(mocks.state.rankChecks).toEqual([]);
    expect(mocks.state.item).toMatchObject({
      rankCheckId: null,
      claimAttempts: 1,
      claimExpiresAt: new Date("2026-09-02T08:05:00Z"),
    });
    expect(mocks.providerFacingCreate).not.toHaveBeenCalled();
  });

  it("lets one concurrent claim reach the real provider-facing prepare write", async () => {
    let status = "queued";
    let lockedBy: symbol | null = null;
    let entered = 0;
    let committed = 0;
    let openGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    const candidate = {
      archivedAt: null,
      claimAttempts: 0,
      claimExpiresAt: null,
      device: "desktop",
      domain: "example.com",
      dueAt: new Date("2026-09-02T07:00:00.000Z"),
      id: "item_1",
      keywordId: "keyword_1",
      keywordPublicId: "kw_abcdefghijklmnopqrstuvwx",
      locationId: "location_1",
      marketActive: true,
      projectId: "project_1",
      runId: "run_1",
      runPublicId: "rcr_abcdefghijklmnopqrstuvwx",
      status: "queued",
    };
    const database = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        const owner = Symbol("transaction");
        const tx = {
          $queryRaw: async (query: unknown) => {
            const sql = sqlText(query);
            if (sql.includes("WITH eligible_items")) {
              entered += 1;
              const selected = status === "queued" && lockedBy === null ? [candidate] : [];
              if (selected.length > 0) lockedBy = owner;
              if (entered === 2) openGate();
              await gate;
              return selected;
            }
            if (
              sql.includes("AND status = 'queued'") &&
              lockedBy === owner &&
              status === "queued"
            ) {
              status = "running";
              return [{ claimAttempts: 1, id: "item_1", status }];
            }
            return [];
          },
          auditLog: { create: vi.fn() },
          rankCheckRun: {
            findUnique: vi.fn(async () => ({
              credentialId: null,
              credentialKind: null,
              source: null,
              trigger: "scheduled",
            })),
            update: vi.fn(),
            updateMany: vi.fn(async () => ({ count: 1 })),
          },
        };
        try {
          const result = await callback(tx);
          committed += 1;
          return result;
        } finally {
          if (lockedBy === owner) lockedBy = null;
        }
      },
    };

    const claims = await Promise.all([
      claimDueRankCheckItems({ now: new Date(baseInput.claimedAt) }, database as never),
      claimDueRankCheckItems({ now: new Date(baseInput.claimedAt) }, database as never),
    ]);
    await Promise.all(
      claims.flatMap((claim) =>
        claim.groups.map((group) =>
          prepareQueuedRankCheckBatch({
            ...baseInput,
            runId: group.runId,
            runItemIds: group.runItemIds,
            runItemClaims: group.runItemClaims,
          }),
        ),
      ),
    );

    expect(committed).toBe(2);
    expect(claims.map((claim) => claim.claimed).sort()).toEqual([0, 1]);
    expect(mocks.state.batches).toHaveLength(1);
    expect(mocks.state.rankChecks).toHaveLength(1);
    expect(mocks.state.tasks).toHaveLength(1);
    expect(mocks.providerFacingCreate).toHaveBeenCalledOnce();
  });

  it("links the claimed item and clears its lease in the prepare transaction", async () => {
    await prepareQueuedRankCheckBatch({
      ...baseInput,
      runId: "run_1",
      runItemIds: ["item_1"],
    });

    expect(mocks.state.batches[0]).toMatchObject({ runId: "run_1" });
    expect(mocks.state.rankChecks[0]).toMatchObject({ runId: "run_1" });
    expect(mocks.prisma.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: { claimExpiresAt: null, rankCheckId: "rank_1" },
      where: {
        id: "item_1",
        keywordId: "keyword_1",
        rankCheckId: null,
        claimAttempts: 1,
        claimExpiresAt: new Date("2026-09-02T08:05:00Z"),
        status: "running",
      },
    });
    expect(mocks.state.item).toMatchObject({ claimExpiresAt: null, rankCheckId: "rank_1" });
  });

  it("resolves a missing item-id field from the batch run and keyword", async () => {
    await prepareQueuedRankCheckBatch({ ...baseInput, runId: "run_1" });

    expect(mocks.prisma.rankCheckRunItem.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        keywordId: true,
        runId: true,
        claimAttempts: true,
        claimExpiresAt: true,
        status: true,
        rankCheckId: true,
      },
      where: { keywordId: { in: ["keyword_1"] }, runId: "run_1" },
    });
    expect(mocks.state.item).toMatchObject({ claimExpiresAt: null, rankCheckId: "rank_1" });
  });

  it("rolls back every paid-work row when a second batch loses the item CAS", async () => {
    await prepareQueuedRankCheckBatch({
      ...baseInput,
      runId: "run_1",
      runItemIds: ["item_1"],
    });

    await expect(
      prepareQueuedRankCheckBatch({
        ...baseInput,
        batchId: "batch_2",
        runId: "run_1",
        runItemIds: ["item_1"],
        workflowRunId: "workflow_1",
      }),
    ).rejects.toThrow("Original run-item claim changed before preparation");

    expect(mocks.state.batches).toHaveLength(1);
    expect(mocks.state.rankChecks).toHaveLength(1);
    expect(mocks.state.tasks).toHaveLength(1);
    expect(mocks.providerFacingCreate).toHaveBeenCalledOnce();
  });
});
