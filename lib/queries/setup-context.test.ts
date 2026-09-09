import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSetupContext } from "./setup-context";

const PROJECT_REF = "prj_abcdefghijklmnopqrstuvwx";
const now = new Date("2026-08-30T12:00:00.000Z");
const scheduledNextRunAt = new Date("2026-09-01T06:00:00.000Z");

const mocks = vi.hoisted(() => ({
  prisma: {
    keyword: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    providerConnection: { count: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    queuedRankCheckBatch: { findMany: vi.fn() },
    rankCheck: { count: vi.fn() },
  },
  effectiveCompetitors: vi.fn(),
  getCompetitorSuggestions: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
}));
vi.mock("@/lib/competitors/suggestions", () => ({
  getCompetitorSuggestions: mocks.getCompetitorSuggestions,
}));
vi.mock("@/lib/competitors/effective", () => ({
  effectiveCompetitors: mocks.effectiveCompetitors,
}));

describe("loadSetupContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      project: { id: "project_1", name: "Example project", publicId: PROJECT_REF },
    });
    mocks.prisma.project.findUnique.mockResolvedValue({ competitorSetupOutcome: null });
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.providerConnection.count.mockResolvedValue(0);
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      frequency: "daily",
      timezone: "UTC",
    });
    mocks.prisma.queuedRankCheckBatch.findMany.mockResolvedValue([]);
    mocks.prisma.rankCheck.count.mockResolvedValue(0);
    mocks.effectiveCompetitors.mockResolvedValue([]);
    mocks.getCompetitorSuggestions.mockResolvedValue([]);
  });

  it("authorizes the route project before loading one authoritative context", async () => {
    await loadSetupContext(PROJECT_REF, now);

    expect(mocks.requireReadableProject).toHaveBeenCalledWith(PROJECT_REF);
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project_1" } }),
    );
    expect(mocks.prisma.providerConnection.count).toHaveBeenCalledWith({
      where: {
        enabled: true,
        kind: "serp",
        projectId: "project_1",
        status: "connected",
      },
    });
    expect(mocks.prisma.rankCheck.count).toHaveBeenCalledWith({
      where: { keyword: { projectId: "project_1" }, status: "completed" },
    });
  });

  it("returns only resolver and later wiring data with explicit project existence", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        dispatchState: { nextCheckAt: scheduledNextRunAt },
        id: "keyword_1",
        publicId: "kw_abcdefghijklmnopqrstuvwx",
        schedule: null,
      },
      {
        dispatchState: null,
        id: "keyword_2",
        publicId: "kw_bcdefghijklmnopqrstuvwxy",
        schedule: { frequency: "manual", timezone: "UTC" },
      },
    ]);
    mocks.prisma.providerConnection.count.mockResolvedValue(1);
    mocks.prisma.rankCheck.count.mockResolvedValue(2);

    await expect(loadSetupContext(PROJECT_REF, now)).resolves.toEqual({
      completedCheckCount: 2,
      competitorSetupOutcome: null,
      competitorSuggestions: [],
      inFlightBatch: null,
      keywordCount: 2,
      keywordIds: ["kw_abcdefghijklmnopqrstuvwx", "kw_bcdefghijklmnopqrstuvwxy"],
      project: {
        exists: true,
        name: "Example project",
        publicRef: PROJECT_REF,
      },
      providerExists: true,
      schedule: { mode: "scheduled", nextRunAt: scheduledNextRunAt, timezone: "UTC" },
    });
  });

  it.each([
    { completedCheckCount: 0, competitorSetupOutcome: null },
    { completedCheckCount: 1, competitorSetupOutcome: "confirmed" },
    { completedCheckCount: 1, competitorSetupOutcome: "skipped" },
  ] as const)("does not derive suggestions outside a ready confirmation state", async (setup) => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      competitorSetupOutcome: setup.competitorSetupOutcome,
    });
    mocks.prisma.rankCheck.count.mockResolvedValue(setup.completedCheckCount);
    mocks.getCompetitorSuggestions.mockResolvedValue([
      { bestPosition: 3, domain: "first.example.org", of: 12, seenOn: 9 },
    ]);

    await expect(loadSetupContext(PROJECT_REF, now)).resolves.toMatchObject({
      completedCheckCount: setup.completedCheckCount,
      competitorSetupOutcome: setup.competitorSetupOutcome,
      competitorSuggestions: [],
    });
    expect(mocks.getCompetitorSuggestions).not.toHaveBeenCalled();
  });

  it("derives suggestions when competitor confirmation is ready", async () => {
    const suggestion = { bestPosition: 3, domain: "first.example.org", of: 12, seenOn: 9 };
    mocks.prisma.rankCheck.count.mockResolvedValue(1);
    mocks.getCompetitorSuggestions.mockResolvedValue([suggestion]);

    await expect(loadSetupContext(PROJECT_REF, now)).resolves.toMatchObject({
      competitorSetupOutcome: null,
      competitorSuggestions: [suggestion],
    });
    expect(mocks.getCompetitorSuggestions).toHaveBeenCalledWith("project_1");
  });

  it("resolves a stale skipped outcome as confirmed from effective membership", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ competitorSetupOutcome: "skipped" });
    mocks.prisma.rankCheck.count.mockResolvedValue(1);
    mocks.effectiveCompetitors.mockResolvedValue([
      {
        aliases: [],
        domain: "legacy.example.org",
        evidence: null,
        id: "cmp_abcdefghijklmnopqrstuvwx",
        label: null,
        scopePolicy: "all_markets",
        source: "manual",
      },
    ]);

    await expect(loadSetupContext(PROJECT_REF, now)).resolves.toMatchObject({
      competitorSetupOutcome: "confirmed",
      competitorSuggestions: [],
    });

    expect(mocks.effectiveCompetitors).toHaveBeenCalledWith("project_1", null);
    expect(mocks.getCompetitorSuggestions).not.toHaveBeenCalled();
  });

  it("uses keyword overrides and dispatch state to resolve the earliest scheduled run", async () => {
    const earlier = new Date("2026-08-31T06:00:00.000Z");
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        dispatchState: { nextCheckAt: scheduledNextRunAt },
        id: "keyword_daily",
        publicId: "kw_abcdefghijklmnopqrstuvwx",
        schedule: { frequency: "daily", timezone: "Europe/Warsaw" },
      },
      {
        dispatchState: { nextCheckAt: earlier },
        id: "keyword_weekly",
        publicId: "kw_bcdefghijklmnopqrstuvwxy",
        schedule: { frequency: "weekly", timezone: "America/New_York" },
      },
      {
        dispatchState: { nextCheckAt: new Date("2026-08-30T01:00:00.000Z") },
        id: "keyword_manual",
        publicId: "kw_cdefghijklmnopqrstuvwxyz",
        schedule: { frequency: "manual", timezone: "UTC" },
      },
    ]);

    const result = await loadSetupContext(PROJECT_REF, now);
    expect(result.schedule).toEqual({
      mode: "scheduled",
      nextRunAt: earlier,
      timezone: "America/New_York",
    });
  });

  it("reports manual mode when no keyword has a runnable future dispatch", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        dispatchState: null,
        id: "keyword_1",
        publicId: "kw_abcdefghijklmnopqrstuvwx",
        schedule: { frequency: "manual", timezone: "UTC" },
      },
    ]);
    await expect(loadSetupContext(PROJECT_REF, now)).resolves.toMatchObject({
      schedule: { mode: "manual" },
    });
  });

  it("derives in-flight progress from active queued batch task states", async () => {
    mocks.prisma.queuedRankCheckBatch.findMany.mockResolvedValue([
      {
        tasks: [
          { rankCheck: { publicId: "check_abcdefghijklmnopqrstuvwx" }, state: "completed" },
          { rankCheck: { publicId: "check_bcdefghijklmnopqrstuvwxy" }, state: "submitted" },
        ],
      },
      {
        tasks: [
          { rankCheck: { publicId: "check_cdefghijklmnopqrstuvwxyz" }, state: "failed" },
          { rankCheck: { publicId: "check_defghijklmnopqrstuvwxyza" }, state: "ready" },
        ],
      },
    ]);

    const result = await loadSetupContext(PROJECT_REF, now);
    expect(result.inFlightBatch).toEqual({
      completed: 1,
      rankCheckIds: ["check_bcdefghijklmnopqrstuvwxy", "check_defghijklmnopqrstuvwxyza"],
      total: 4,
    });
    expect(mocks.prisma.queuedRankCheckBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: "project_1" }),
      }),
    );
  });

  it.each(["daily", "weekly", "monthly", "custom_cron"] as const)(
    "exposes future %s dispatch as scheduled",
    async (frequency) => {
      mocks.prisma.keyword.findMany.mockResolvedValue([
        {
          dispatchState: { nextCheckAt: scheduledNextRunAt },
          id: `keyword_${frequency}`,
          publicId: "kw_abcdefghijklmnopqrstuvwx",
          schedule: { frequency, timezone: "Europe/Warsaw" },
        },
      ]);
      await expect(loadSetupContext(PROJECT_REF, now)).resolves.toMatchObject({
        schedule: {
          mode: "scheduled",
          nextRunAt: scheduledNextRunAt,
          timezone: "Europe/Warsaw",
        },
      });
    },
  );

  it.each(["manual", "paused"] as const)(
    "keeps a keyword %s override manual over scheduled defaults",
    async (frequency) => {
      mocks.prisma.keyword.findMany.mockResolvedValue([
        {
          dispatchState: { nextCheckAt: scheduledNextRunAt },
          id: `keyword_${frequency}`,
          publicId: "kw_abcdefghijklmnopqrstuvwx",
          schedule: { frequency, timezone: "UTC" },
        },
      ]);
      await expect(loadSetupContext(PROJECT_REF, now)).resolves.toMatchObject({
        schedule: { mode: "manual" },
      });
    },
  );

  it("does not expose a dispatch exactly at now as waiting", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        dispatchState: { nextCheckAt: now },
        id: "keyword_due",
        publicId: "kw_abcdefghijklmnopqrstuvwx",
        schedule: { frequency: "daily", timezone: "UTC" },
      },
    ]);
    await expect(loadSetupContext(PROJECT_REF, now)).resolves.toMatchObject({
      schedule: { mode: "manual" },
    });
  });

  it("does not expose a missing or stale dispatch as waiting", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        dispatchState: null,
        id: "keyword_missing",
        publicId: "kw_abcdefghijklmnopqrstuvwx",
        schedule: { frequency: "daily", timezone: "UTC" },
      },
      {
        dispatchState: { nextCheckAt: new Date("2026-08-30T11:59:59.999Z") },
        id: "keyword_stale",
        publicId: "kw_bcdefghijklmnopqrstuvwxy",
        schedule: { frequency: "weekly", timezone: "UTC" },
      },
    ]);
    await expect(loadSetupContext(PROJECT_REF, now)).resolves.toMatchObject({
      schedule: { mode: "manual" },
    });
  });

  it("keeps an active zero-task batch as running progress", async () => {
    mocks.prisma.queuedRankCheckBatch.findMany.mockResolvedValue([{ tasks: [] }]);
    await expect(loadSetupContext(PROJECT_REF, now)).resolves.toMatchObject({
      inFlightBatch: { completed: 0, rankCheckIds: [], total: 0 },
    });
  });
});
