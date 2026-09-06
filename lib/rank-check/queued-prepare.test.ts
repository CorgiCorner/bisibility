import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimDueRankCheckItems } from "./items-claim";
import { prepareQueuedRankCheckBatch } from "./queued-prepare";

const mocks = vi.hoisted(() => {
  const state = {
    batches: [] as Array<Record<string, unknown>>,
    item: {
      claimExpiresAt: new Date("2026-09-02T08:05:00.000Z") as Date | null,
      id: "item_1",
      keywordId: "keyword_1",
      rankCheckId: null as string | null,
      runId: "run_1",
      status: "running",
    },
    rankChecks: [] as Array<Record<string, unknown>>,
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
    $executeRaw: vi.fn(async () => 1),
    auditLog: { create: vi.fn(async () => ({ id: "audit_1" })) },
    keyword: {
      findMany: vi.fn(async () => [
        {
          archivedAt: null as Date | null,
          id: "keyword_1",
          locationId: "location_active",
          locationRef: {},
          publicId: "kw_abcdefghijklmnopqrstuvwx",
          rankChecks: [],
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
    rankCheckRun: { update: vi.fn(async () => ({})) },
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
          where: { id: string; keywordId: string; rankCheckId: null; status: string };
        }) => {
          if (
            where.id === state.item.id &&
            where.keywordId === state.item.keywordId &&
            where.rankCheckId === null &&
            where.status === state.item.status &&
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
    prisma,
    providerFacingCreate,
    publishOperationChanged: vi.fn(() => Promise.resolve()),
    state,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
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

const baseInput = {
  batchId: "batch_1",
  claimedAt: "2026-09-02T08:00:00.000Z",
  chunkIndex: 0,
  device: "desktop",
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
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "1");
    mocks.state.batches = [];
    mocks.state.item = {
      claimExpiresAt: new Date("2026-09-02T08:05:00.000Z"),
      id: "item_1",
      keywordId: "keyword_1",
      rankCheckId: null,
      runId: "run_1",
      status: "running",
    };
    mocks.state.rankChecks = [];
    mocks.state.tasks = [];
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each<[string, Array<{ locationId: string }>, Date | null, string]>([
    [
      "a paused market",
      [{ locationId: "location_other" }],
      null,
      "The market for these keywords is no longer active.",
    ],
    [
      "an archived keyword",
      [{ locationId: "location_active" }],
      new Date("2026-09-01T06:00:00.000Z"),
      "The keyword was archived before the queued batch could start.",
    ],
  ])("defers the batch and buys nothing for %s", async (_case, markets, archivedAt, reason) => {
    mocks.prisma.projectMarket.findMany.mockResolvedValueOnce(markets);
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([
      {
        archivedAt,
        id: "keyword_1",
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
      deferredReason: reason,
      estimatedCostCents: null,
      status: "deferred",
    });
    expect(mocks.state.tasks[0]).toMatchObject({ error: reason, state: "deferred" });
  });

  it("replays old input without runItemIds through the original standalone writes", async () => {
    await expect(prepareQueuedRankCheckBatch(baseInput)).resolves.toMatchObject({
      batchId: "batch_1",
      state: "prepared",
    });

    expect(mocks.prisma.rankCheckRunItem.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheckRunItem.updateMany).not.toHaveBeenCalled();
    expect(mocks.state.rankChecks).toHaveLength(1);
    expect(mocks.state.tasks).toHaveLength(1);
    expect(mocks.state.batches[0]).not.toHaveProperty("runId");
    expect(mocks.state.rankChecks[0]).not.toHaveProperty("runId");
    expect(mocks.publishOperationChanged).toHaveBeenCalledWith({ projectId: "project_1" });
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
          rankCheckRun: { update: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
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
        status: "running",
      },
    });
    expect(mocks.state.item).toMatchObject({ claimExpiresAt: null, rankCheckId: "rank_1" });
  });

  it("resolves a missing item-id field from the batch run and keyword", async () => {
    await prepareQueuedRankCheckBatch({ ...baseInput, runId: "run_1" });

    expect(mocks.prisma.rankCheckRunItem.findMany).toHaveBeenCalledWith({
      select: { id: true, keywordId: true, runId: true },
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
        workflowRunId: "workflow_2",
      }),
    ).rejects.toThrow("claim was lost before preparation");

    expect(mocks.state.batches).toHaveLength(1);
    expect(mocks.state.rankChecks).toHaveLength(1);
    expect(mocks.state.tasks).toHaveLength(1);
    expect(mocks.providerFacingCreate).toHaveBeenCalledOnce();
  });
});
