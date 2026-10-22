import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  budget: vi.fn(),
  keywords: vi.fn(),
  defaults: vi.fn(),
  primary: vi.fn(),
  projection: vi.fn(),
  spend: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { keyword: { findMany: mocks.keywords } } }));
vi.mock("@/lib/checks/upcoming-view", async (original) => {
  const module = await original<typeof import("@/lib/checks/upcoming-view")>();
  return {
    ...module,
    buildUpcomingView: (input: Parameters<typeof module.buildUpcomingView>[0]) => {
      mocks.projection(input);
      return module.buildUpcomingView(input);
    },
  };
});
vi.mock("./_auth", () => ({
  requireReadableProject: async () => ({
    project: { id: "project", budgetCapCents: 5000, writeMode: "active" },
  }),
}));
vi.mock("./workspace-request-data", () => ({
  getRequestProjectDefaults: mocks.defaults,
  getRequestSerpProviderChain: async () => [{ provider: "dataforseo" }],
  getRequestPrimarySerpProvider: mocks.primary,
}));
vi.mock("@/lib/metering/usage-read", () => ({ monthlySpendCents: mocks.spend }));
vi.mock("@/lib/metering/project-budget-read", () => ({
  projectBudgetCapCents: vi.fn(),
  projectBudgetStatus: mocks.budget,
}));

import { getUpcomingView } from "./upcoming-view";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.keywords.mockResolvedValue([]);
  mocks.defaults.mockResolvedValue({ frequency: "daily", timezone: "UTC", serpDepth: 100 });
  mocks.budget.mockResolvedValue({ budget: { limit: null }, uncertain: false });
  mocks.primary.mockResolvedValue(null);
  mocks.spend.mockResolvedValue(0);
});

test("upcoming forecast reads the Store cap rather than the legacy project cap", async () => {
  mocks.budget.mockResolvedValue({
    budget: { limit: { unit: "budget_cents", value: 777n, scale: 0 } },
    reserved: { unit: "budget_cents", value: 0n, scale: 0 },
    uncertain: false,
  });
  expect((await getUpcomingView("project")).forecast?.capCents).toBe(777);
});

test("upcoming forecast uses the funding budget spend for a split project", async () => {
  mocks.primary.mockResolvedValue({ credentialSource: "own" });
  mocks.spend.mockResolvedValue(80);
  mocks.budget.mockResolvedValue({
    budget: {
      id: "own-project:project:monthly",
      limit: { unit: "budget_cents", value: 100n, scale: 0 },
    },
    used: { unit: "budget_cents", value: 15n, scale: 0 },
    reserved: { unit: "budget_cents", value: 0n, scale: 0 },
    uncertain: false,
  });

  expect((await getUpcomingView("project")).forecast).toMatchObject({
    capCents: 100,
    spentCents: 15,
  });
  expect(mocks.spend).not.toHaveBeenCalled();
});

test("only active named membership creates upcoming rows; legacy cadence stays manual", async () => {
  const schedule = {
    publicId: "sch_daily",
    frequency: "daily",
    enabled: true,
    archivedAt: null,
    cronExpression: null,
    timeOfDay: "07:00",
    jitterMinutes: 0,
    timezone: "UTC",
    serpDepth: 20,
  };
  const rows = [
    {
      id: "active",
      publicId: "kw_active",
      text: "active",
      archivedAt: null,
      checkSchedule: schedule,
      schedule: null,
    },
    {
      id: "manual",
      publicId: "kw_manual",
      text: "manual",
      archivedAt: null,
      checkSchedule: null,
      schedule: { frequency: "daily" },
    },
    {
      id: "paused",
      publicId: "kw_paused",
      text: "paused",
      archivedAt: null,
      checkSchedule: { ...schedule, enabled: false },
      schedule: null,
    },
    {
      id: "archivedSchedule",
      publicId: "kw_archivedSchedule",
      text: "old",
      archivedAt: null,
      checkSchedule: { ...schedule, archivedAt: new Date(0) },
      schedule: null,
    },
    {
      id: "archivedKeyword",
      publicId: "kw_archivedKeyword",
      text: "deleted",
      archivedAt: new Date(0),
      checkSchedule: schedule,
      schedule: null,
    },
  ];
  mocks.keywords.mockImplementation(async ({ where }) =>
    rows.filter((row) => (where.archivedAt === null ? row.archivedAt === null : true)),
  );
  await getUpcomingView("project", { now: new Date("2026-10-21T12:00:00Z") });
  expect(mocks.keywords).toHaveBeenCalledWith(
    expect.objectContaining({ where: { projectId: "project", archivedAt: null } }),
  );
  expect(mocks.projection).toHaveBeenCalledWith(
    expect.objectContaining({
      schedules: [
        expect.objectContaining({
          keywordId: "kw_active",
          frequency: "daily",
          nextCheckAt: new Date("2026-10-22T07:00:00Z"),
          serpDepth: 20,
        }),
      ],
    }),
  );
});
