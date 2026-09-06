import { beforeEach, describe, expect, it, vi } from "vitest";
import { planRankCheckRuns, scheduleAdmission } from "./plan";

const mocks = vi.hoisted(() => ({
  assertAllocation: vi.fn(),
  assertBudget: vi.fn(),
  existingKeys: new Set<string>(),
  findMany: vi.fn(),
  isBudgetExhausted: vi.fn(),
  loadChain: vi.fn(),
  makePublicId: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
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
      { id: `${id}_keyword_1`, publicId: "kw_a00000000000000000000000" },
      { id: `${id}_keyword_2`, publicId: "kw_b00000000000000000000000" },
    ],
    project: {
      budgetCapCents: 1_000,
      defaults: { serpDepth: 20, timezone: "UTC" },
      providerAllocationsInitializedAt: null,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existingKeys.clear();
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
        keywords: [{ id: "keyword_1" }],
        project: {
          budgetCapCents: 1_000,
          defaults: { serpDepth: 20 },
          providerAllocationsInitializedAt: null,
        },
        projectId: "project_1",
        providerPolicy: "project",
        serpDepth: null,
      },
      new Date("2026-09-02T00:00:00.000Z"),
    );

    expect(mocks.loadChain).toHaveBeenCalledWith("project_1", undefined);
  });
});
