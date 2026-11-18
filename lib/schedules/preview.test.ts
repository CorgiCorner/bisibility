import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewScheduleChange } from "./preview";

const now = new Date("2026-10-08T12:00:00.000Z");
const mocks = vi.hoisted(() => ({
  aiPrompt: vi.fn(),
  aiSchedule: vi.fn(),
  count: vi.fn(),
  defaults: vi.fn(),
  keywords: vi.fn(),
  rank: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiPrompt: { findMany: mocks.aiPrompt },
    aiTrackingSchedule: { findFirst: mocks.aiSchedule },
    checkSchedule: { findFirst: mocks.rank },
    keyword: { count: mocks.count, findMany: mocks.keywords },
    projectDefaults: { findUnique: mocks.defaults },
    projectMarket: { findMany: async () => [] },
    providerConnection: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("./local-monitors", () => ({ listLocalMonitorSchedules: vi.fn(async () => []) }));

const actor = { id: "user_1", memberships: [] };
const rank = {
  archivedAt: null,
  cronExpression: null,
  enabled: true,
  frequency: "weekly" as const,
  jitterMinutes: 0,
  measurementEpoch: 4n,
  providerPolicy: "dataforseo",
  publicId: "sch_a00000000000000000000000" as const,
  serpDepth: 20,
  timeOfDay: null,
  timezone: "UTC",
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.defaults.mockResolvedValue({ serpDepth: 20, timezone: "UTC" });
  mocks.rank.mockResolvedValue(rank);
  mocks.count.mockResolvedValue(2);
  mocks.keywords.mockResolvedValue([]);
});

describe("previewScheduleChange", () => {
  it("previews a rank create as zero spend and no review", async () => {
    const preview = await previewScheduleChange(
      "project_1",
      actor,
      {
        body: {
          input: {
            cronExpression: null,
            frequency: "daily",
            jitterMinutes: 60,
            name: "Daily",
            projectId: "prj_a00000000000000000000000",
            providerPolicy: "dataforseo",
          },
          kind: "rank",
        },
        op: "create",
      },
      now,
    );
    expect(preview.requires_review).toBe(false);
    expect(preview.preview_token).toBeNull();
    expect(preview.cost_before_cents).toBe(0);
    expect(preview.cost_after_cents).toBe(0);
    expect(preview.expected_revision).toMatch(/^[1-9]\d*$/);
  });

  it("previews a rank update that increases projected spend", async () => {
    const preview = await previewScheduleChange(
      "project_1",
      actor,
      {
        body: {
          input: {
            frequency: "daily",
            projectId: "prj_a00000000000000000000000",
            scheduleId: rank.publicId,
          },
          kind: "rank",
        },
        id: rank.publicId,
        op: "update",
      },
      now,
    );
    expect(preview.review_reasons).toEqual(["cost_increase"]);
    expect(preview.preview_token).toMatch(/^[^.]+\.[^.]+$/);
    expect(preview.cost_after_cents).toBeGreaterThan(preview.cost_before_cents ?? 0);
  });

  it("previews assigning a manual keyword onto a schedule", async () => {
    mocks.keywords.mockResolvedValue([
      {
        checkSchedule: null,
        id: "keyword_1",
        measurementTargetEpoch: 1n,
        publicId: "kw_a00000000000000000000000",
      },
    ]);
    const preview = await previewScheduleChange(
      "project_1",
      actor,
      { keywordIds: ["kw_a00000000000000000000000"], op: "keywords", scheduleId: rank.publicId },
      now,
    );
    expect(preview.review_reasons).toContain("manual_to_scheduled");
    expect(preview.requires_review).toBe(true);
  });

  it("previews pause, archive, and restore without review", async () => {
    for (const state of ["paused", "archived"] as const) {
      const preview = await previewScheduleChange(
        "project_1",
        actor,
        { command: { kind: "rank" }, id: rank.publicId, op: "state", state },
        now,
      );
      expect(preview.requires_review).toBe(false);
      expect(preview.preview_token).toBeNull();
    }
    const restored = await previewScheduleChange(
      "project_1",
      actor,
      { command: { kind: "rank", restore: true }, id: rank.publicId, op: "state", state: "paused" },
      now,
    );
    expect(restored.requires_review).toBe(false);
  });

  it("previews an AI cron increase from the stored configuration", async () => {
    mocks.aiSchedule.mockResolvedValue({
      archivedAt: null,
      configuration: {
        configurations: [
          {
            endpoint: "ai_optimization/chat_gpt/llm_scraper/task_post",
            engine: "chat_gpt",
            model: null,
            parameters: {},
            provider: "dataforseo",
            source: "consumer_scrape",
          },
        ],
        promptIds: ["prompt_1"],
      },
      cron: "0 9 * * 1",
      enabled: true,
      name: "Weekly",
      projectId: "project_1",
      publicId: "ais_a00000000000000000000000",
      timezone: "UTC",
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    mocks.aiPrompt.mockResolvedValue([
      {
        archivedAt: null,
        id: "prompt_1",
        pausedAt: null,
        publicId: "aip_a00000000000000000000000",
        topicId: null,
      },
    ]);
    const preview = await previewScheduleChange(
      "project_1",
      actor,
      {
        body: { input: { cron: "0 * * * *" }, kind: "ai" },
        id: "ais_a00000000000000000000000",
        op: "update",
      },
      now,
    );
    expect(preview.review_reasons).toContain("cost_increase");
  });

  it("requires review for an enabled AI create with prompts and skips a disabled create", async () => {
    const configuration = {
      configurations: [
        {
          endpoint: "ai_optimization/chat_gpt/llm_scraper/task_post",
          engine: "chat_gpt",
          model: null,
          parameters: {},
          provider: "dataforseo",
          source: "consumer_scrape",
        },
      ],
      promptIds: ["prompt_1"],
    };
    mocks.aiPrompt.mockResolvedValue([{ archivedAt: null, id: "prompt_1", pausedAt: null }]);
    const enabled = await previewScheduleChange(
      "project_1",
      actor,
      {
        body: {
          input: {
            configuration: configuration as never,
            cron: "0 9 * * *",
            enabled: true,
            name: "Daily",
            timezone: "UTC",
          },
          kind: "ai",
        },
        op: "create",
      },
      now,
    );
    expect(enabled.requires_review).toBe(true);
    expect(enabled.cost_after_cents).toBeGreaterThan(0);
    const disabled = await previewScheduleChange(
      "project_1",
      actor,
      {
        body: {
          input: {
            configuration: configuration as never,
            cron: "0 9 * * *",
            enabled: false,
            name: "Daily",
            timezone: "UTC",
          },
          kind: "ai",
        },
        op: "create",
      },
      now,
    );
    expect(disabled.requires_review).toBe(false);
    expect(disabled.cost_after_cents).toBe(0);
  });

  it("does not review a rank update that disables the schedule and changes provider policy", async () => {
    const preview = await previewScheduleChange(
      "project_1",
      actor,
      {
        body: {
          input: {
            enabled: false,
            projectId: "prj_a00000000000000000000000",
            providerPolicy: "project",
            scheduleId: rank.publicId,
          },
          kind: "rank",
        },
        id: rank.publicId,
        op: "update",
      },
      now,
    );
    expect(preview.requires_review).toBe(false);
    expect(preview.review_reasons).toEqual([]);
  });
});
