import { defaultPromptRunEstimateUsd } from "@/lib/ai-tracking/tracking-engine-prices";
import { scheduledRunsPerMonth } from "@/lib/cost-estimate/project-estimate";
import { beforeEach, expect, it, vi } from "vitest";
import { listRankSchedules, projectAiSchedules } from "./checks";
import { scheduleCostTotal } from "./cost-total";
import { aiFixture, priceNow, rankFixture } from "./list.test-fixture";

const mocks = vi.hoisted(() => ({
  rank: vi.fn(),
  rankRuns: vi.fn(),
  aiRuns: vi.fn(),
  activePrompts: vi.fn(),
}));
vi.mock("@/lib/queries/check-schedule-list", () => ({ listCheckScheduleRows: mocks.rank }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    rankCheckRun: { findMany: mocks.rankRuns },
    aiTrackingRun: { findMany: mocks.aiRuns },
    aiPrompt: { findMany: mocks.activePrompts },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.activePrompts.mockResolvedValue(aiFixture.promptIds.map((publicId) => ({ publicId })));
  mocks.rank.mockResolvedValue([rankFixture]);
  mocks.rankRuns.mockResolvedValue([
    {
      startedAt: priceNow,
      status: "completed",
      outcome: "succeeded",
      checkSchedule: { publicId: rankFixture.publicId },
    },
  ]);
  mocks.aiRuns.mockResolvedValue([
    { createdAt: priceNow, state: "completed", schedule: { publicId: aiFixture.id } },
  ]);
});
it.each([
  { reason: "one paused prompt", active: [aiFixture.promptIds[0]], cents: 48 },
  { reason: "one archived prompt", active: [aiFixture.promptIds[0]], cents: 48 },
  { reason: "all targets inactive", active: [], cents: 0 },
  { reason: "a paused topic", active: [], cents: 0 },
  { reason: "an archived topic", active: [], cents: 0 },
])("matches the active-target AI page estimate with $reason", async ({ active, cents }) => {
  mocks.activePrompts.mockResolvedValue(active.map((publicId) => ({ publicId })));
  const [row] = await projectAiSchedules("project", [aiFixture], priceNow);
  const oldAi =
    (defaultPromptRunEstimateUsd(active.length, priceNow.getTime()) ?? 0) *
    100 *
    (scheduledRunsPerMonth("custom_cron", aiFixture.cron) ?? 0);
  expect(row.monthly_cost_estimate_cents).toBe(oldAi);
  expect(row.monthly_cost_estimate_cents).toBe(cents);
  expect(row.target.ids).toEqual(aiFixture.promptIds);
  expect(row.target_summary.prompts).toBe(2);
  expect(mocks.activePrompts).toHaveBeenCalledExactlyOnceWith({
    where: {
      projectId: "project",
      archivedAt: null,
      pausedAt: null,
      OR: [{ topicId: null }, { topic: { is: { archivedAt: null, pausedAt: null } } }],
    },
    select: { publicId: true },
  });
});
it("loads billable prompt IDs once for multiple schedules", async () => {
  const rows = await projectAiSchedules(
    "project",
    [aiFixture, { ...aiFixture, id: "ais_other" }],
    priceNow,
  );
  expect(mocks.activePrompts).toHaveBeenCalledOnce();
  expect(rows.map((row) => row.monthly_cost_estimate_cents)).toEqual([96, 96]);
});
it("projects rank membership, stable ids, state, retained history and existing per-run pricing", async () => {
  const [row] = await listRankSchedules("project", "current");
  expect(row).toMatchObject({
    id: "sch_daily",
    name: rankFixture.name,
    kind: "rank",
    group: "checks",
    state: "active",
    last_run_at: priceNow.toISOString(),
    last_run_state: "succeeded",
    target_summary: { keywords: 1, targets: 2 },
    monthly_cost_estimate_cents: 720,
    actions: ["read"],
  });
  expect(mocks.rank).toHaveBeenCalledWith("project", "current");
  expect(mocks.rankRuns).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ projectId: "project" }) }),
  );
});
it.each([
  { enabled: false, archivedAt: null, state: "paused" },
  { enabled: true, archivedAt: priceNow.toISOString(), state: "archived" },
])("keeps rank $state intent without a future run", async ({ state, ...values }) => {
  mocks.rank.mockResolvedValue([{ ...rankFixture, ...values, nextRunAt: priceNow.toISOString() }]);
  expect((await listRankSchedules("project", "current"))[0]).toMatchObject({
    state,
    next_run_at: null,
    monthly_cost_estimate_cents: 720,
  });
});
it("preserves rank and AI totals for the characterized fixture using existing pricing", async () => {
  const rank = await listRankSchedules("project", "current");
  const ai = await projectAiSchedules("project", [aiFixture], priceNow);
  const oldRank = rankFixture.perRunCents * (scheduledRunsPerMonth(rankFixture.frequency) ?? 0);
  const oldAi =
    (defaultPromptRunEstimateUsd(aiFixture.promptIds.length, priceNow.getTime()) ?? 0) *
    100 *
    (scheduledRunsPerMonth("custom_cron", aiFixture.cron) ?? 0);
  expect(rank[0].monthly_cost_estimate_cents).toBe(oldRank);
  expect(ai[0]).toMatchObject({
    id: aiFixture.id,
    kind: "ai",
    group: "checks",
    state: "active",
    target_summary: { prompts: 2 },
    last_run_state: "completed",
    monthly_cost_estimate_cents: oldAi,
  });
  expect(scheduleCostTotal([...rank, ...ai])).toEqual({ cents: oldRank + oldAi, unknown: 0 });
});
it("does not turn stale AI pricing into a zero-priced schedule", async () => {
  const ai = await projectAiSchedules("project", [aiFixture], new Date("2026-11-13T00:00:00Z"));
  expect(ai[0].monthly_cost_estimate_cents).toBeNull();
  expect(scheduleCostTotal(ai)).toEqual({ cents: 0, unknown: 1 });
});
it("excludes paused and archived schedules from the active total", async () => {
  const rows = await projectAiSchedules(
    "project",
    [
      { ...aiFixture, enabled: false },
      { ...aiFixture, archivedAt: priceNow.toISOString() },
    ],
    priceNow,
  );
  expect(rows.map((row) => row.state)).toEqual(["paused", "archived"]);
  expect(scheduleCostTotal(rows)).toEqual({ cents: 0, unknown: 0 });
});
it("preserves the existing fractional native estimate instead of multiplying a rounded display price", async () => {
  mocks.rank.mockResolvedValue([
    {
      ...rankFixture,
      perRunCents: 1,
      nativeEstimate: {
        providerId: "dataforseo",
        unit: "cents",
        quantity: 0.12,
        unknownTargets: 0,
      },
    },
  ]);
  expect((await listRankSchedules("project", "current"))[0].monthly_cost_estimate_cents).toBe(3.6);
});
it("keeps a retained paused frequency paused even if its enabled flag is true", async () => {
  mocks.rank.mockResolvedValue([
    { ...rankFixture, frequency: "paused", nextRunAt: priceNow.toISOString() },
  ]);
  expect((await listRankSchedules("project", "current"))[0]).toMatchObject({
    state: "paused",
    next_run_at: null,
  });
});
it("keeps the AI page's standard AIO price estimate", async () => {
  const ai = {
    ...aiFixture,
    configurations: [
      { ...aiFixture.configurations[0], engine: "google" as const, source: "google_aio" as const },
    ],
  };
  expect((await projectAiSchedules("project", [ai], priceNow))[0].monthly_cost_estimate_cents).toBe(
    96,
  );
});
