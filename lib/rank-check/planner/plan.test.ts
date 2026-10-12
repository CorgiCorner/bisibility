import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { planRankCheckRuns, scheduleAdmission } from "./plan";

const mocks = vi.hoisted(() => ({
  assertAllocation: vi.fn(),
  assertBudget: vi.fn(),
  assertOperationAccess: vi.fn(),
  existingKeys: new Set<string>(),
  findMany: vi.fn(),
  currentSchedule: vi.fn(),
  queryRaw: vi.fn(),
  isBudgetExhausted: vi.fn(),
  loadChain: vi.fn(),
  makePublicId: vi.fn(),
  nativeCosts: vi.fn(),
  queuedRoute: vi.fn(),
  upsert: vi.fn(),
  skipEmpty: vi.fn(),
}));

vi.mock("./empty-schedule", () => ({ skipEmptyScheduleOccurrences: mocks.skipEmpty }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/operations/access-extension", () => ({
  assertOperationAccess: mocks.assertOperationAccess,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: object) => unknown) =>
      fn({
        $queryRaw: mocks.queryRaw,
        projectMarket: { findMany: vi.fn().mockResolvedValue([{ locationId: "location_active" }]) },
        checkSchedule: { findFirst: mocks.currentSchedule },
        rankCheckRun: {
          findUnique: vi.fn(({ where }) =>
            Promise.resolve(
              mocks.existingKeys.has(where.projectId_idempotencyKey.idempotencyKey)
                ? { id: "existing" }
                : null,
            ),
          ),
          upsert: mocks.upsert,
        },
      }),
    checkSchedule: { findMany: mocks.findMany },
    project: { findUnique: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
    providerCostEntry: { aggregate: vi.fn(), count: vi.fn() },
    rankCheckRun: {
      findUnique: vi.fn(({ where }) =>
        Promise.resolve(
          mocks.existingKeys.has(where.projectId_idempotencyKey.idempotencyKey)
            ? { id: "existing" }
            : null,
        ),
      ),
      upsert: mocks.upsert,
    },
  },
}));
vi.mock("@/lib/db/public-id", () => ({ makePublicId: mocks.makePublicId }));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.loadChain,
}));
vi.mock("@/lib/provider-rates/native-rank-request", () => ({
  loadNativeRankRequestCosts: mocks.nativeCosts,
}));
vi.mock("@/lib/rank-check/queued-routing", () => ({ queuedRankCheckRoute: mocks.queuedRoute }));
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: mocks.assertBudget,
  isBudgetExhaustedError: mocks.isBudgetExhausted,
}));
vi.mock("@/lib/provider-usage/enforcement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/provider-usage/enforcement")>()),
  assertProviderAllocationAvailable: mocks.assertAllocation,
}));

function schedule(
  id: string,
  frequency: "daily" | "weekly" | "custom_cron",
  overrides: Record<string, unknown> = {},
) {
  return {
    cronExpression: frequency === "custom_cron" ? "0 12 * * *" : null,
    enabled: true,
    frequency,
    id,
    jitterMinutes: 0,
    keywords: [
      {
        id: `${id}_keyword_1`,
        publicId: "kw_a00000000000000000000000",
        locationId: "location_active",
      },
      {
        id: `${id}_keyword_2`,
        publicId: "kw_b00000000000000000000000",
        locationId: "location_active",
      },
    ],
    project: {
      markets: [{ locationId: "location_active" }],
      defaults: { serpDepth: 20, timezone: "UTC" },
    },
    projectId: "project_1",
    providerPolicy: null,
    publicId: `sch_${id.padEnd(24, "a")}`,
    serpDepth: null,
    timeOfDay: frequency === "weekly" ? "06:00" : null,
    timezone: "UTC",
    ...overrides,
  };
}

describe("rank-check run planner", () => {
  it("does not plan occurrences for an empty schedule", async () => {
    mocks.findMany.mockResolvedValue([schedule("empty", "daily", { keywords: [] })]);
    expect(await planRankCheckRuns({ now: new Date("2026-09-03T00:00:00Z") })).toMatchObject({
      planned: 0,
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not recreate an occurrence when its final member was deleted after the scan", async () => {
    mocks.findMany.mockResolvedValue([schedule("emptied", "daily")]);
    mocks.currentSchedule.mockImplementation(({ where }) =>
      Promise.resolve(where.keywords ? null : { id: "emptied" }),
    );
    expect(await planRankCheckRuns({ now: new Date("2026-09-03T00:00:00Z") })).toMatchObject({
      planned: 0,
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nativeCosts.mockResolvedValue(undefined);
    mocks.queuedRoute.mockResolvedValue({ mode: "legacy", reason: "dispatcher_disabled" });
    mocks.existingKeys.clear();
    mocks.currentSchedule.mockResolvedValue({ id: "schedule" });
    let sequence = 0;
    mocks.makePublicId.mockImplementation(() => `rcr_${String(++sequence).padStart(24, "a")}`);
    mocks.loadChain.mockResolvedValue([
      {
        costPerCheckCents: 2,
        id: "connection_1",
        provider: "serpapi",
        rateContext: { entries: [], manualAmountCents: null },
      },
    ]);
    mocks.assertBudget.mockResolvedValue({ capCents: 1_000, spentCents: 0 });
    mocks.isBudgetExhausted.mockReturnValue(false);
    mocks.upsert.mockImplementation(({ create }) => {
      mocks.existingKeys.add(create.idempotencyKey);
      return Promise.resolve({ ...create, id: `run_${mocks.existingKeys.size}` });
    });
  });

  it("does not recreate occurrences from a scan taken before archiving", async () => {
    mocks.findMany.mockResolvedValue([schedule("daily", "daily")]);
    mocks.currentSchedule.mockResolvedValue(null);
    await planRankCheckRuns({ now: new Date("2026-09-02T08:00:00.000Z") });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.currentSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "daily",
          archivedAt: null,
          enabled: true,
          keywords: { some: { archivedAt: null, locationId: { in: ["location_active"] } } },
        },
      }),
    );
  });

  it("creates a thin planned row for each enabled occurrence", async () => {
    mocks.findMany.mockResolvedValue([
      schedule("daily", "daily"),
      schedule("weekly", "weekly"),
      schedule("cron", "custom_cron"),
      schedule("empty", "daily", { keywords: [] }),
    ]);
    const now = new Date("2026-09-02T00:00:00.000Z");

    const first = await planRankCheckRuns({ now });
    const createdAfterFirst = mocks.upsert.mock.calls.length;
    const second = await planRankCheckRuns({ now });

    expect(first.planned).toBe(createdAfterFirst);
    expect(createdAfterFirst).toBeGreaterThan(3);
    expect(second.planned).toBe(0);
    for (const [{ create }] of mocks.upsert.mock.calls) {
      expect(create).toMatchObject({
        estimatedCostCents: 0,
        keywordCount: 0,
        requestedCount: 0,
        selectionKind: "scheduled_due",
        status: "planned",
        targetCount: 0,
        totalCount: 0,
        trigger: "scheduled",
      });
      expect(create).not.toHaveProperty("items");
    }
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          frequency: { in: ["daily", "weekly", "monthly", "custom_cron"] },
        }),
      }),
    );
  });

  it("does not admit or materialize a run while planning", async () => {
    mocks.findMany.mockResolvedValue([schedule("daily", "daily")]);
    mocks.loadChain.mockRejectedValue(new Error("admission must happen at launch"));

    await expect(
      planRankCheckRuns({ now: new Date("2026-09-02T00:00:00.000Z") }),
    ).resolves.toMatchObject({
      blocked: 0,
    });

    expect(mocks.upsert).toHaveBeenCalled();
    expect(mocks.loadChain).not.toHaveBeenCalled();
    expect(mocks.assertBudget).not.toHaveBeenCalled();
  });

  it("uses the project provider when a schedule follows the project default", async () => {
    await scheduleAdmission(
      {
        keywords: [{ id: "keyword_1", text: "plain" }],
        project: {
          defaults: { serpDepth: 20 },
        },
        projectId: "project_1",
        providerPolicy: "project",
        serpDepth: null,
      },
      new Date("2026-09-02T00:00:00.000Z"),
    );

    expect(mocks.loadChain).toHaveBeenCalledWith("project_1", undefined, undefined);
  });

  it("keeps a schedule blocked until the access gate allows the project again", async () => {
    mocks.assertOperationAccess.mockRejectedValueOnce(new OperationAccessDeniedError());

    const admission = await scheduleAdmission(
      {
        keywords: [{ id: "keyword_1", text: "plain" }],
        project: {
          defaults: { serpDepth: 20 },
        },
        projectId: "project_1",
        providerPolicy: "project",
        serpDepth: null,
      },
      new Date("2026-09-02T00:00:00.000Z"),
    );

    // The run stays blocked under a neutral reason; no provider is marked
    // bad, no connection is loaded or altered, and no budget is spent.
    expect(admission.blockedReason).toBe("operation_unavailable");
    expect(mocks.loadChain).not.toHaveBeenCalled();
    expect(mocks.assertBudget).not.toHaveBeenCalled();
  });

  it("uses actual keyword quotes for the schedule budget", async () => {
    mocks.loadChain.mockResolvedValue([
      {
        id: "connection_1",
        provider: "dataforseo",
        credentialSource: "own",
        credentialsEncrypted: "encrypted",
      },
    ]);
    mocks.nativeCosts.mockResolvedValue([0.2, 1]);
    const input = {
      keywords: [
        { id: "a", text: "plain" },
        { id: "b", text: "site:example.com" },
      ],
      project: { defaults: { serpDepth: 10 } },
      projectId: "project_1",
      providerPolicy: "project",
      serpDepth: null,
    };
    const result = await scheduleAdmission(input, new Date());
    expect(result.itemCosts).toEqual([0.2, 1]);
    expect(result.estimatedCostCents).toBe(2);
    expect(mocks.nativeCosts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "connection_1" }),
      [
        { keyword: "plain", depth: 10 },
        { keyword: "site:example.com", depth: 10 },
      ],
      expect.any(Date),
    );
  });

  it("does not treat a partly unknown schedule price as zero", async () => {
    mocks.nativeCosts.mockResolvedValue([null]);
    const result = await scheduleAdmission(
      {
        keywords: [{ id: "a", text: "plain" }],
        project: { defaults: { serpDepth: 10 } },
        projectId: "project_1",
        providerPolicy: "project",
        serpDepth: null,
      },
      new Date(),
    );
    expect(result.blockedReason).toBe("pricing_unavailable");
    expect(mocks.assertBudget).not.toHaveBeenCalled();
  });

  it("quotes the selected queued priority when dispatch will use the queue", async () => {
    vi.stubEnv("DATAFORSEO_QUEUE_PRIORITY", "normal");
    try {
      mocks.queuedRoute.mockResolvedValue({ mode: "queued", provider: "dataforseo" });
      mocks.loadChain.mockResolvedValue([
        {
          id: "connection_1",
          provider: "dataforseo",
          credentialSource: "own",
          credentialsEncrypted: "encrypted",
        },
      ]);
      mocks.nativeCosts.mockResolvedValue([0.3]);
      const result = await scheduleAdmission(
        {
          keywords: [{ id: "a", text: "site:example.com" }],
          project: { defaults: { serpDepth: 10 } },
          projectId: "project_1",
          providerPolicy: "project",
          serpDepth: null,
        },
        new Date(),
      );
      expect(result.itemCosts).toEqual([0.3]);
      expect(mocks.nativeCosts).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        [{ keyword: "site:example.com", depth: 10, priority: "normal" }],
        expect.any(Date),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
