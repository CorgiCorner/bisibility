import type { PlanTrackingRunInput, SourceConfiguration } from "@/lib/ai-tracking/contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewScheduleChange } from "./preview";
import { assessScheduleSpend } from "./review-decision";
import { loadScheduleSpend, type ScheduleChange } from "./review-load";
import { loadAi } from "./review-load-state";

const now = new Date("2026-10-08T12:00:00.000Z");
const projectId = "project_1";
const scheduleId = "ais_a00000000000000000000000";
const actor = { id: "user_1", memberships: [] };
const configuration: SourceConfiguration = {
  endpoint: "ai_optimization/chat_gpt/llm_scraper/task_post",
  engine: "chat_gpt",
  model: null,
  parameters: {},
  provider: "dataforseo",
  source: "consumer_scrape",
};
const prompts = Array.from({ length: 50 }, (_, index) => ({
  archivedAt: null as Date | null,
  id: `prompt_${index + 1}`,
  pausedAt: null as Date | null,
  publicId: `aip_${String(index + 1).padStart(23, "0")}`,
}));
const promptIds = prompts.map((prompt) => prompt.id);
const mocks = vi.hoisted(() => ({ prompts: vi.fn(), schedule: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiPrompt: { findMany: mocks.prompts },
    aiTrackingSchedule: { findFirst: mocks.schedule },
    projectDefaults: { findUnique: vi.fn(async () => ({ serpDepth: 20, timezone: "UTC" })) },
  },
}));
vi.mock("./local-monitors", () => ({ listLocalMonitorSchedules: vi.fn(async () => []) }));

function trackingConfiguration(
  ids: string[],
  configurations = [configuration],
): PlanTrackingRunInput {
  return {
    actorId: actor.id,
    budgetRevision: "budget_1",
    configurations,
    consentRevision: "consent_1",
    credentialConnectionId: "connection_1",
    credentialVersion: "credentials_1",
    deadline: "2026-10-08T13:00:00.000Z",
    entrySource: "app",
    idempotencyKey: "schedule_1",
    origin: "scheduled",
    promptIds: ids,
  };
}

function storedSchedule(ids: string[], configurations = [configuration]) {
  mocks.schedule.mockResolvedValue({
    archivedAt: null,
    configuration: trackingConfiguration(ids, configurations),
    cron: "0 9 * * *",
    enabled: true,
    name: "Daily",
    projectId,
    publicId: scheduleId,
    timezone: "UTC",
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  });
}

function update(ids: string[], configurations = [configuration]): ScheduleChange {
  return {
    body: {
      input: { configuration: trackingConfiguration(ids, configurations) },
      kind: "ai",
    },
    id: scheduleId,
    op: "update",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prompts.mockResolvedValue(prompts);
  storedSchedule([promptIds[0]]);
});

describe("AI schedule configuration pricing", () => {
  const liveConfiguration = {
    ...configuration,
    endpoint: "ai_optimization/chat_gpt/llm_scraper/live/advanced",
  };

  it("requires cost_increase review for an endpoint-only queued-to-live change", async () => {
    const preview = await previewScheduleChange(
      projectId,
      actor,
      update([promptIds[0]], [liveConfiguration]),
      now,
    );
    expect(preview.cost_before_cents).toBe(360);
    expect(preview.cost_after_cents).toBe(1200);
    expect(preview.requires_review).toBe(true);
    expect(preview.review_reasons).toEqual(["cost_increase"]);
    expect(preview.preview_token).toMatch(/^[^.]+\.[^.]+$/);
  });

  it("treats an identical configuration resubmission as noop", async () => {
    const loaded = await loadScheduleSpend(projectId, update([promptIds[0]]), now);
    expect(loaded.spend.operation).toBe("noop");
    expect(assessScheduleSpend(loaded.spend)).toEqual({
      cost_after_cents: 360,
      cost_before_cents: 360,
      requires_review: false,
      review_reasons: [],
    });
  });

  it("treats reordered configurations and parameter keys as noop", async () => {
    const scrape = { ...configuration, parameters: { language_code: "en", location_code: 2840 } };
    const aio: SourceConfiguration = {
      ...configuration,
      endpoint: "serp/google/organic/task_post",
      engine: "google",
      source: "google_aio",
    };
    storedSchedule([promptIds[0]], [scrape, aio]);
    const loaded = await loadScheduleSpend(
      projectId,
      update(
        [promptIds[0]],
        [aio, { ...scrape, parameters: { location_code: 2840, language_code: "en" } }],
      ),
      now,
    );
    expect(loaded.spend.operation).toBe("noop");
    expect(assessScheduleSpend(loaded.spend).requires_review).toBe(false);
  });

  it("preserves duplicate configuration charges", async () => {
    storedSchedule([promptIds[0]], [configuration, configuration, liveConfiguration]);
    const loaded = await loadScheduleSpend(
      projectId,
      update([promptIds[0]], [configuration, liveConfiguration, liveConfiguration]),
      now,
    );
    expect(loaded.spend.operation).toBe("update");
    expect(assessScheduleSpend(loaded.spend)).toEqual({
      cost_after_cents: 2760,
      cost_before_cents: 1920,
      requires_review: true,
      review_reasons: ["cost_increase"],
    });
  });

  it("requires review for a configuration change when both price bounds are unknown", async () => {
    const loaded = await loadScheduleSpend(
      projectId,
      update([promptIds[0]], [liveConfiguration]),
      new Date("2026-11-14T12:00:00.000Z"),
    );
    expect(loaded.spend.operation).toBe("update");
    expect(assessScheduleSpend(loaded.spend)).toEqual({
      cost_after_cents: null,
      cost_before_cents: null,
      requires_review: true,
      review_reasons: ["price_unknown"],
    });
  });
});

describe("AI schedule prompt membership pricing", () => {
  it("requires cost_increase review when an enabled schedule grows from 1 to 50 active prompts", async () => {
    const preview = await previewScheduleChange(projectId, actor, update(promptIds), now);
    expect(preview.requires_review).toBe(true);
    expect(preview.review_reasons).toEqual(["cost_increase"]);
    expect(preview.cost_before_cents).toBe(360);
    expect(preview.cost_after_cents).toBe(18_000);
    expect(preview.preview_token).toMatch(/^[^.]+\.[^.]+$/);
  });

  it("prices a decrease from 50 to 1 active prompts without review", async () => {
    storedSchedule(promptIds);
    const preview = await previewScheduleChange(projectId, actor, update([promptIds[0]]), now);
    expect(preview.cost_before_cents).toBe(18_000);
    expect(preview.cost_after_cents).toBe(360);
    expect(preview.requires_review).toBe(false);
    expect(preview.review_reasons).toEqual([]);
    expect(preview.preview_token).toBeNull();
  });

  it("treats a promptIds-only replacement at the same active count as an update", async () => {
    const loaded = await loadAi(
      projectId,
      scheduleId,
      { configuration: { promptIds: [promptIds[1]] } },
      20,
      now,
    );
    expect(loaded.spend.operation).toBe("update");
    expect(loaded.spend.before.members).toBe(1);
    expect(loaded.spend.after.members).toBe(1);
    expect(assessScheduleSpend(loaded.spend).requires_review).toBe(false);
  });

  it.each(["archivedAt", "pausedAt"] as const)(
    "excludes %s prompts from both stored and proposed quotes",
    async (inactiveField) => {
      mocks.prompts.mockResolvedValue(
        prompts.map((prompt, index) => ({
          ...prompt,
          [inactiveField]: index >= 2 ? now : null,
        })),
      );
      storedSchedule([promptIds[0], ...promptIds.slice(2, 26)]);
      const loaded = await loadScheduleSpend(projectId, update(promptIds), now);
      expect(loaded.spend.before.members).toBe(1);
      expect(loaded.spend.after.members).toBe(2);
      expect(assessScheduleSpend(loaded.spend)).toEqual({
        cost_after_cents: 720,
        cost_before_cents: 360,
        requires_review: true,
        review_reasons: ["cost_increase"],
      });
    },
  );

  it("retains stored membership when a patch omits promptIds", async () => {
    const loaded = await loadAi(
      projectId,
      scheduleId,
      { configuration: { configurations: [configuration] }, cron: "0 9 * * 1" },
      20,
      now,
    );
    expect(loaded.spend.before.members).toBe(1);
    expect(loaded.spend.after.members).toBe(1);
    expect(assessScheduleSpend(loaded.spend).requires_review).toBe(false);
  });

  it("treats reordered prompt membership as unchanged", async () => {
    storedSchedule(promptIds);
    const loaded = await loadScheduleSpend(projectId, update([...promptIds].reverse()), now);
    expect(loaded.spend.operation).toBe("noop");
    expect(assessScheduleSpend(loaded.spend).requires_review).toBe(false);
  });

  it("creates an enabled AI schedule from idle using only active prompts", async () => {
    mocks.prompts.mockResolvedValue([
      prompts[0],
      { ...prompts[1], archivedAt: now },
      { ...prompts[2], pausedAt: now },
    ]);
    const loaded = await loadScheduleSpend(
      projectId,
      {
        body: {
          input: {
            configuration: trackingConfiguration(promptIds.slice(0, 3)),
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
    expect(loaded.spend.before.members).toBe(0);
    expect(loaded.spend.after.members).toBe(1);
    expect(assessScheduleSpend(loaded.spend)).toEqual({
      cost_after_cents: 360,
      cost_before_cents: 0,
      requires_review: true,
      review_reasons: ["cost_increase"],
    });
  });
});

it("prices the same members when an AI update uses project-scoped public prompt IDs", async () => {
  const preview = await previewScheduleChange(
    projectId,
    actor,
    update(prompts.slice(0, 2).map((prompt) => prompt.publicId)),
    now,
  );
  expect(preview).toMatchObject({
    cost_before_cents: 360,
    cost_after_cents: 720,
    requires_review: true,
  });
});

it("selects public prompt IDs in the scoped AI create quote", async () => {
  const ids = prompts.slice(0, 2).map((prompt) => prompt.publicId);
  mocks.prompts.mockImplementation(async ({ where }) =>
    where.OR?.some((condition: { publicId?: { in: string[] } }) =>
      condition.publicId?.in.includes(ids[0]),
    )
      ? prompts.slice(0, 2)
      : [],
  );
  const preview = await previewScheduleChange(
    projectId,
    actor,
    {
      op: "create",
      body: {
        kind: "ai",
        input: {
          configuration: trackingConfiguration(ids),
          cron: "0 9 * * *",
          enabled: true,
          name: "Daily",
          timezone: "UTC",
        },
      },
    },
    now,
  );
  expect(mocks.prompts).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ projectId }),
    }),
  );
  expect(preview).toMatchObject({
    cost_before_cents: 0,
    cost_after_cents: 720,
    requires_review: true,
  });
});
