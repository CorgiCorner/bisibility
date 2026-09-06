import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkSchedule: { findMany: vi.fn() },
  getDefaults: vi.fn(),
  keyword: { groupBy: vi.fn() },
  keywordTag: { findMany: vi.fn() },
  loadProviderChain: vi.fn(),
  projectMarket: { findMany: vi.fn() },
  resolveDepth: vi.fn(),
  unitCost: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cost-estimate/project-estimate", () => ({ unitCostCentsFor: mocks.unitCost }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    checkSchedule: mocks.checkSchedule,
    keyword: mocks.keyword,
    keywordTag: mocks.keywordTag,
    projectMarket: mocks.projectMarket,
  },
}));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.loadProviderChain,
}));
vi.mock("@/lib/serp/markets", () => ({ resolveSerpDepth: mocks.resolveDepth }));
vi.mock("./workspace-request-data", () => ({ getRequestProjectDefaults: mocks.getDefaults }));

import { listCheckScheduleRows } from "./check-schedule-list";

describe("check schedule list query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDefaults.mockResolvedValue({ serpDepth: 20, timezone: "Europe/Madrid" });
    mocks.loadProviderChain.mockResolvedValue([
      {
        costPerCheckCents: 12,
        provider: "serpapi",
        rateContext: { entries: [], manualAmountCents: null },
      },
    ]);
    mocks.resolveDepth.mockReturnValue(20);
    mocks.unitCost.mockReturnValue(12);
    mocks.keyword.groupBy.mockResolvedValue([]);
    mocks.keywordTag.findMany.mockResolvedValue([]);
    mocks.projectMarket.findMany.mockResolvedValue([{ locationId: "market_live" }]);
  });

  it("derives row scope, cadence, and per-run cost from schedule data", async () => {
    mocks.checkSchedule.findMany.mockResolvedValue([
      {
        cronExpression: null,
        enabled: false,
        frequency: "weekly",
        isDefault: false,
        jitterMinutes: 15,
        _count: { keywords: 2 },
        id: "schedule_1",
        name: "Commercial weekly",
        providerPolicy: null,
        publicId: "sch_commercial",
        rankCheckRuns: [{ plannedFor: new Date("2026-09-07T04:00:00.000Z") }],
        serpDepth: null,
        timeOfDay: "06:00",
        timezone: "Europe/Madrid",
      },
    ]);
    mocks.keyword.groupBy.mockResolvedValue([
      { checkScheduleId: "schedule_1", device: "desktop", locationId: "es", text: "coffee beans" },
      { checkScheduleId: "schedule_1", device: "desktop", locationId: "fr", text: "coffee beans" },
    ]);
    mocks.keywordTag.findMany.mockResolvedValue([
      { keyword: { checkScheduleId: "schedule_1" }, tag: { name: "commercial" } },
      { keyword: { checkScheduleId: "schedule_1" }, tag: { name: "commercial" } },
    ]);

    await expect(listCheckScheduleRows("project_1")).resolves.toEqual([
      expect.objectContaining({
        keywordCount: 1,
        memberMeta: "2 markets x 1 device",
        perRunCents: 24,
        tagScope: "tag = commercial",
        targetCount: 2,
        weekday: "Monday",
      }),
    ]);
    expect(mocks.loadProviderChain).toHaveBeenCalledWith("project_1", undefined);
    expect(mocks.unitCost).toHaveBeenCalledWith(
      expect.objectContaining({ overrideCents: 12, providerId: "serpapi" }),
      20,
    );
    expect(mocks.checkSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ keywords: expect.anything() }),
      }),
    );
    expect(mocks.keyword.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ["checkScheduleId", "device", "locationId", "text"] }),
    );
  });

  it("keeps a paused schedule estimate when it has no planned run", async () => {
    mocks.checkSchedule.findMany.mockResolvedValue([
      {
        cronExpression: null,
        enabled: false,
        frequency: "weekly",
        isDefault: false,
        jitterMinutes: 15,
        _count: { keywords: 1 },
        id: "schedule_1",
        name: "Paused weekly",
        providerPolicy: null,
        publicId: "sch_paused",
        rankCheckRuns: [],
        serpDepth: null,
        timeOfDay: "06:00",
        timezone: "Europe/Madrid",
      },
    ]);
    mocks.keyword.groupBy.mockResolvedValue([
      { checkScheduleId: "schedule_1", device: "desktop", locationId: "es", text: "coffee beans" },
    ]);

    await expect(listCheckScheduleRows("project_1")).resolves.toEqual([
      expect.objectContaining({
        dayOfMonth: null,
        perRunCents: 12,
        weekday: null,
      }),
    ]);
  });

  it("counts and prices only runnable schedule members", async () => {
    const schedule = {
      cronExpression: null,
      enabled: true,
      frequency: "daily",
      isDefault: false,
      jitterMinutes: 15,
      id: "schedule_1",
      name: "Runnable daily",
      providerPolicy: null,
      publicId: "sch_runnable",
      rankCheckRuns: [],
      serpDepth: null,
      timeOfDay: "06:00",
      timezone: "Europe/Madrid",
    };
    mocks.checkSchedule.findMany.mockImplementation(({ select }) =>
      Promise.resolve([
        {
          ...schedule,
          _count: {
            keywords:
              typeof select._count.select.keywords === "object" &&
              "where" in select._count.select.keywords
                ? 1
                : 3,
          },
        },
      ]),
    );
    mocks.keyword.groupBy.mockImplementation(({ where }) =>
      Promise.resolve(
        where.archivedAt === null
          ? [
              {
                checkScheduleId: "schedule_1",
                device: "desktop",
                locationId: "market_live",
                text: "live keyword",
              },
            ]
          : [
              {
                checkScheduleId: "schedule_1",
                device: "desktop",
                locationId: "market_live",
                text: "live keyword",
              },
              {
                checkScheduleId: "schedule_1",
                device: "desktop",
                locationId: "market_live",
                text: "archived keyword",
              },
              {
                checkScheduleId: "schedule_1",
                device: "desktop",
                locationId: "market_paused",
                text: "paused keyword",
              },
            ],
      ),
    );

    await expect(listCheckScheduleRows("project_1")).resolves.toEqual([
      expect.objectContaining({ keywordCount: 1, perRunCents: 12, targetCount: 1 }),
    ]);
    expect(mocks.projectMarket.findMany).toHaveBeenCalledWith({
      select: { locationId: true },
      where: { projectId: "project_1", status: "active" },
    });
  });

  it("labels weekly and monthly schedules from their persisted calendar cron", async () => {
    mocks.checkSchedule.findMany.mockResolvedValue([
      {
        cronExpression: "0 6 * * 5",
        enabled: true,
        frequency: "weekly",
        isDefault: false,
        jitterMinutes: 15,
        _count: { keywords: 0 },
        keywords: [],
        name: "Friday",
        providerPolicy: null,
        publicId: "sch_friday",
        rankCheckRuns: [],
        serpDepth: null,
        timeOfDay: "06:00",
        timezone: "Europe/Madrid",
      },
      {
        cronExpression: "0 6 15 * *",
        enabled: true,
        frequency: "monthly",
        isDefault: false,
        jitterMinutes: 15,
        _count: { keywords: 0 },
        keywords: [],
        name: "Mid-month",
        providerPolicy: null,
        publicId: "sch_midmonth",
        rankCheckRuns: [],
        serpDepth: null,
        timeOfDay: "06:00",
        timezone: "Europe/Madrid",
      },
    ]);

    await expect(listCheckScheduleRows("project_1")).resolves.toEqual([
      expect.objectContaining({ weekday: "Friday" }),
      expect.objectContaining({ dayOfMonth: "15th" }),
    ]);
  });
});
