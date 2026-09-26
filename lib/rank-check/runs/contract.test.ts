import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  gscImportOperationSchema,
  ITEM_STATUSES,
  itemStatusSchema,
  operationSnapshotSchema,
  PARENT_RELATIONS,
  parentRelationSchema,
  RUN_OUTCOMES,
  RUN_STATUSES,
  RUN_TRIGGERS,
  rankCheckOperationSchema,
  rankCheckProviderSchema,
  runCountsSchema,
  runOutcomeSchema,
  runStatusSchema,
  runTriggerSchema,
  SELECTION_KINDS,
  selectionKindSchema,
} from "./contract";

const launchMocks = vi.hoisted(() => ({
  assertBudgetAvailable: vi.fn(),
  estimatedCost: vi.fn(() => 25),
  loadProviderChain: vi.fn(),
  lockSelectionRows: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn(async () => [{ locationId: "location_active" }]) },
    rankCheckRun: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  },
  resolveSelection: vi.fn(),
  verifyToken: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: launchMocks.prisma }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: launchMocks.writeAudit }));
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: launchMocks.assertBudgetAvailable,
  isBudgetExhaustedError: () => false,
}));
vi.mock("@/lib/provider-usage/enforcement", () => ({
  assertProviderAllocationAvailable: vi.fn(),
  ProviderAllocationExhaustedError: class extends Error {},
}));
vi.mock("@/lib/rank-check/default-cost", () => ({
  estimatedRankCheckCostCents: launchMocks.estimatedCost,
}));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: launchMocks.loadProviderChain,
}));
vi.mock("./selection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./selection")>();
  return {
    ...actual,
    lockRunSelectionKeywords: launchMocks.lockSelectionRows,
    resolveRunSelection: launchMocks.resolveSelection,
  };
});
vi.mock("./preview-token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./preview-token")>();
  return { ...actual, verifyPreviewToken: launchMocks.verifyToken };
});

import { launchRankCheckRun } from "./launch";

const counts = {
  requested: 4,
  total: 3,
  skipped: 1,
  completed: 2,
  failed: 0,
  deferred: 0,
  cancelled: 1,
};

const rankCheckFixture = {
  kind: "rank_check",
  id: "rcr_example",
  status: "completed",
  outcome: "succeeded",
  trigger: "manual",
  selectionKind: "selected",
  counts,
  keywordCount: 2,
  targetCount: 1,
  provider: "serpapi",
  providerLabel: "SerpApi",
  estimatedCostCents: 12,
  costCents: 10,
  blockedReason: null,
  etaSeconds: 15,
  plannedFor: "2026-09-02T08:00:00.000Z",
  nextCheckAt: null,
  snapshotAt: "2026-09-02T08:01:00.000Z",
  startedAt: "2026-09-02T08:01:00.000Z",
  finishedAt: "2026-09-02T08:02:00.000Z",
  parentRunId: null,
} as const;

describe("operation snapshot contract", () => {
  it("parses a complete rank-check snapshot", () => {
    expect(operationSnapshotSchema.parse(rankCheckFixture)).toEqual(rankCheckFixture);
    expect(rankCheckOperationSchema.safeParse(rankCheckFixture).success).toBe(true);
  });

  it("parses a minimal GSC import snapshot", () => {
    const fixture = {
      capabilities: { pause: true, resume: false, retry: false },
      kind: "gsc_import",
      id: "import_example",
      presentation: { action: "pause", supportingText: null, title: "Importing" },
      property: "sc-domain:example.com",
      state: "running",
      progress: { done: 2, total: 5 },
    } as const;

    expect(operationSnapshotSchema.parse(fixture)).toEqual(fixture);
    expect(gscImportOperationSchema.safeParse(fixture).success).toBe(true);
  });

  it("parses the non-mutating GSC reconnect presentation", () => {
    const fixture = {
      capabilities: { pause: false, resume: false, retry: false },
      kind: "gsc_import",
      id: "import_example",
      presentation: {
        action: "reconnect",
        supportingText: "Reconnect Search Console to continue importing.",
        title: "Reconnect required",
      },
      property: "sc-domain:example.com",
      state: "paused",
      progress: { done: 2, total: 5 },
    } as const;

    expect(gscImportOperationSchema.parse(fixture)).toEqual(fixture);
  });

  it("rejects an unknown operation kind", () => {
    expect(operationSnapshotSchema.safeParse({ kind: "other" }).success).toBe(false);
  });

  it("rejects a rank-check status outside the vocabulary", () => {
    expect(operationSnapshotSchema.safeParse({ ...rankCheckFixture, status: "done" }).success).toBe(
      false,
    );
  });

  it("rejects an internal database id as the parent run id", () => {
    expect(
      rankCheckOperationSchema.safeParse({
        ...rankCheckFixture,
        parentRunId: "cm0internalparentid",
      }).success,
    ).toBe(false);
  });

  it("keeps a rank-check provider inside the SERP catalogue vocabulary", () => {
    expect(rankCheckProviderSchema.safeParse("serpapi").success).toBe(true);
    expect(rankCheckProviderSchema.safeParse("gsc").success).toBe(false);
  });

  it("keeps an unconfirmed or fractional ledger cost in the operation contract", () => {
    expect(
      rankCheckOperationSchema.safeParse({ ...rankCheckFixture, costCents: null }).success,
    ).toBe(true);
    expect(
      rankCheckOperationSchema.safeParse({ ...rankCheckFixture, costCents: 0.925 }).success,
    ).toBe(true);
    expect(rankCheckOperationSchema.safeParse({ ...rankCheckFixture, costCents: -1 }).success).toBe(
      false,
    );
    expect(
      operationSnapshotSchema.safeParse({ ...rankCheckFixture, costCents: null }).success,
    ).toBe(true);
  });

  it("keeps fractional confirmed spend in the operation budget contract", () => {
    expect(
      rankCheckOperationSchema.safeParse({
        ...rankCheckFixture,
        budget: { capCents: 5_000, spentCents: 1_250.4 },
      }).success,
    ).toBe(true);
    expect(
      rankCheckOperationSchema.safeParse({
        ...rankCheckFixture,
        budget: { capCents: 5_000, spentCents: -1 },
      }).success,
    ).toBe(false);
  });
});

describe("closed run vocabulary", () => {
  const vocabularies = [
    { name: "run triggers", schema: runTriggerSchema, values: RUN_TRIGGERS },
    { name: "selection kinds", schema: selectionKindSchema, values: SELECTION_KINDS },
    { name: "run statuses", schema: runStatusSchema, values: RUN_STATUSES },
    { name: "run outcomes", schema: runOutcomeSchema, values: RUN_OUTCOMES },
    { name: "item statuses", schema: itemStatusSchema, values: ITEM_STATUSES },
    { name: "parent relations", schema: parentRelationSchema, values: PARENT_RELATIONS },
  ];

  it.each(vocabularies)(
    "rejects casing and whitespace variants for $name",
    ({ schema, values }) => {
      for (const value of values) {
        expect(schema.safeParse(`${value} `).success).toBe(false);
        expect(schema.safeParse(value.toUpperCase()).success).toBe(false);
      }
    },
  );
});

describe("run counts contract", () => {
  it("accepts non-negative integers", () => {
    expect(runCountsSchema.parse(counts)).toEqual(counts);
  });

  it("rejects negative and fractional counts", () => {
    expect(runCountsSchema.safeParse({ ...counts, failed: -1 }).success).toBe(false);
    expect(runCountsSchema.safeParse({ ...counts, completed: 1.5 }).success).toBe(false);
  });
});

describe("concurrent rank-check run launches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    launchMocks.resolveSelection.mockResolvedValue({
      keywordIds: ["keyword_1"],
      selectionHash: "a".repeat(64),
    });
    launchMocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 5_000,
      defaults: { serpDepth: 100 },
      providerAllocationsInitializedAt: null,
    });
    launchMocks.loadProviderChain.mockResolvedValue([
      { costPerCheckCents: 25, id: "connection_1", provider: "provider-a" },
    ]);
  });

  it.each([
    ["an API", "api", 1],
    // A manual launch keeps both: the operator was told about the overlap and pays twice.
    ["a manual", "manual", 2],
  ] as const)(
    "serializes %s launch that interleaves before either write",
    async (_label, trigger, queuedRuns) => {
      let completedReads = 0;
      let releaseReads: () => void = () => undefined;
      const bothReadsCompleted = new Promise<void>((resolve) => {
        releaseReads = resolve;
      });
      launchMocks.prisma.keyword.findMany.mockImplementation(async () => {
        completedReads += 1;
        if (completedReads === 2) releaseReads();
        await bothReadsCompleted;
        return [
          {
            archivedAt: null,
            id: "keyword_1",
            locationId: "location_active",
            queuedRankCheckTasks: [],
            rankCheckRunItems: [],
            rankChecks: [{ status: "completed" }],
            schedule: { serpDepth: 50 },
            text: "one",
          },
        ];
      });

      const items: Array<{ keywordId: string; runId: string }> = [];
      let runSequence = 0;
      let readsObservedAtFirstWrite = 0;
      let previousTransaction = Promise.resolve();
      let sourceLocksAcquired = 0;
      launchMocks.prisma.$transaction.mockImplementation(async (callback) => {
        let releaseTransaction: (() => void) | undefined;
        const tx = {
          // Both transactions enter, but the second waits at the budget advisory lock until the
          // first commits. Its locked keyword read must then observe the first queued item.
          $executeRaw: vi.fn(async () => {
            const waitForPrevious = previousTransaction;
            previousTransaction = new Promise<void>((resolve) => {
              releaseTransaction = resolve;
            });
            await waitForPrevious;
            sourceLocksAcquired += 1;
            return 1;
          }),
          $queryRaw: vi.fn(async () => [{ id: "project_1" }]),
          project: { findUnique: launchMocks.prisma.project.findUnique },
          projectMarket: { findMany: vi.fn(async () => [{ locationId: "location_active" }]) },
          rankCheckRun: {
            create: vi.fn(async () => {
              readsObservedAtFirstWrite ||= completedReads;
              runSequence += 1;
              return { id: `run_${runSequence}` };
            }),
            findUnique: vi.fn(async () => null),
          },
          rankCheckRunItem: {
            createMany: vi.fn(
              async ({ data }: { data: Array<{ keywordId: string; runId: string }> }) => {
                items.push(...data.map(({ keywordId, runId }) => ({ keywordId, runId })));
                return { count: data.length };
              },
            ),
          },
        };
        try {
          return await callback(tx);
        } finally {
          releaseTransaction?.();
        }
      });
      launchMocks.lockSelectionRows.mockImplementation(async () => [
        {
          archivedAt: null,
          id: "keyword_1",
          locationId: "location_active",
          queuedRankCheckTasks: [],
          rankCheckRunItems: items.some(({ keywordId }) => keywordId === "keyword_1")
            ? [{ status: "queued" }]
            : [],
          rankChecks: [{ status: "completed" }],
          schedule: { serpDepth: 50 },
          text: "one",
        },
      ]);
      const launch = (actorId: string) =>
        launchRankCheckRun({
          actorId,
          origin: { source: "app" },
          previewToken: "signed-token",
          project: { domain: "example.com", id: "project_1", isSample: false },
          spec: { kind: "single", keywordId: "kw_abcdefghijklmnopqrstuvwx", v: 1 },
          trigger,
        });

      const results = await Promise.all([launch("user_1"), launch("user_2")]);

      expect(readsObservedAtFirstWrite).toBe(2);
      expect(sourceLocksAcquired).toBe(2);
      expect(items).toHaveLength(queuedRuns);
      expect(results[0]).toMatchObject({ status: "queued" });
      expect(results[1]).toMatchObject(
        queuedRuns === 1 ? { outcome: "nothing_to_run" } : { status: "queued" },
      );
    },
  );
});
