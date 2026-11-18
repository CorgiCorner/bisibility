import { keywordCreateReviewSchema } from "@/lib/schemas/keyword-create-review";
import { beforeEach, expect, it, vi } from "vitest";
import { keywordCreateChange } from "./keyword-create-change";
import { previewScheduleChange } from "./preview";

const mocks = vi.hoisted(() => ({
  keywords: vi.fn(),
  capacity: vi.fn(),
  defaults: vi.fn(),
  target: vi.fn(),
  market: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/api/deferred-keyword-location", () => ({
  deferredKeywordLocations: () => ({}),
  resolveLocationForReview: async (input: { selection: { canonicalKey: string } }) => ({
    location: { id: input.selection.canonicalKey, canonicalKey: input.selection.canonicalKey },
  }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findMany: mocks.keywords },
    projectMarket: { findFirst: mocks.market },
    projectDefaults: { findUnique: mocks.defaults },
    providerConnection: { findFirst: async () => ({ provider: "dataforseo" }) },
    checkSchedule: { findFirst: mocks.target },
  },
}));
vi.mock("@/lib/capacity/capacity-extension", () => ({ prepareResourceCapacity: mocks.capacity }));
const actor = { id: "user", memberships: [] };
const input = {
  projectId: "project",
  keywords: ["rank", "seo"],
  devices: ["desktop" as const],
  locations: [{ locationKey: "US" }],
  tags: [],
  schedule: {
    frequency: "daily" as const,
    jitterMinutes: 0,
    timezone: "UTC",
    cronExpression: null,
    serpDepth: 50 as const,
  },
};
const target = {
  publicId: `sch_${"a".repeat(24)}`,
  enabled: true,
  archivedAt: null,
  frequency: "weekly" as const,
  providerPolicy: "dataforseo",
  serpDepth: null,
  timezone: "UTC",
  jitterMinutes: 0,
  timeOfDay: null,
  cronExpression: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.target.mockResolvedValue(target);
  mocks.keywords.mockResolvedValue([]);
  mocks.defaults.mockResolvedValue({ serpDepth: 20, timezone: "UTC" });
  mocks.capacity.mockImplementation(async (_client, request) => ({
    enabled: true,
    projection: {
      scheduledKeywords: {
        projected: 7 + (request.preview?.deltas?.scheduledKeywords ?? 0),
        exceeded: false,
      },
    },
  }));
});
it("prices new keywords through stage-A rank cents and projects scheduled capacity", async () => {
  const change = keywordCreateChange(input);
  const preview = await previewScheduleChange("project", actor, change);
  expect(preview.requires_review).toBe(true);
  expect(preview.cost_before_cents).toBe(0);
  // N=2, D=50: five pages per check, same catalog unit and 30 runs as stage A.
  const { rankUnitCents } = await import("./review-cost");
  const unit = rankUnitCents(50, "dataforseo");
  if (unit === null) throw new Error("Fixture provider must have a list price.");
  expect(preview.cost_after_cents).toBe(2 * 30 * unit);
  expect(preview.capacity).toMatchObject({ dimensions: { scheduledKeywords: { projected: 9 } } });
});
it("skips active duplicates but includes archived keywords as fresh joins", async () => {
  mocks.keywords.mockResolvedValue([
    { text: "rank", locationId: "US", device: "desktop", archivedAt: null },
    {
      text: "seo",
      locationId: "US",
      device: "desktop",
      archivedAt: new Date(),
      schedule: { serpDepth: 20 },
    },
  ]);
  const preview = await previewScheduleChange("project", actor, keywordCreateChange(input));
  expect(preview.requires_review).toBe(true);
  expect(preview.capacity).toMatchObject({ dimensions: { scheduledKeywords: { projected: 8 } } });
});
it.each(["manual", "paused"] as const)(
  "%s creates need no review and no scheduled capacity",
  async (frequency) => {
    const preview = await previewScheduleChange(
      "project",
      actor,
      keywordCreateChange({ ...input, schedule: { ...input.schedule, frequency } }),
    );
    expect(preview.requires_review).toBe(false);
    expect(preview.preview_token).toBeNull();
    expect(preview.cost_after_cents).toBe(0);
    expect(preview.capacity).toMatchObject({ dimensions: { scheduledKeywords: { projected: 7 } } });
  },
);
it("canonicalizes order and duplicates while binding each keyword and pricing input", async () => {
  const first = await previewScheduleChange("project", actor, keywordCreateChange(input));
  const reordered = await previewScheduleChange(
    "project",
    actor,
    keywordCreateChange({ ...input, keywords: ["seo", "rank", "Rank"] }),
  );
  expect(reordered.preview_token).toBe(first.preview_token);
  const changed = await previewScheduleChange(
    "project",
    actor,
    keywordCreateChange({ ...input, keywords: ["different"] }),
  );
  expect(changed.preview_token).not.toBe(first.preview_token);
  expect(
    keywordCreateReviewSchema.safeParse({ ...keywordCreateChange(input), keywords: [] }).success,
  ).toBe(false);
});
it("does not request review for a batch consisting entirely of active duplicates", async () => {
  mocks.keywords.mockResolvedValue(
    input.keywords.map((text) => ({ text, locationId: "US", device: "desktop", archivedAt: null })),
  );
  const preview = await previewScheduleChange(
    "project",
    actor,
    keywordCreateChange({ ...input, checkScheduleId: `sch_${"a".repeat(24)}` }),
  );
  expect(preview.requires_review).toBe(false);
});
it("quotes per-keyword cadence inputs for a future mixed public create batch", async () => {
  const change = {
    op: "keywords-create" as const,
    scheduleId: null,
    cadence: null,
    keywords: [
      {
        keyword: "rank",
        device: "desktop" as const,
        locationKey: "US",
        cadence: { ...input.schedule, serpDepth: 10 as const },
      },
      {
        keyword: "seo",
        device: "mobile" as const,
        locationKey: "US",
        cadence: { ...input.schedule, serpDepth: 50 as const },
      },
    ],
  };
  const preview = await previewScheduleChange("project", actor, change);
  const { rankUnitCents } = await import("./review-cost");
  expect(preview.cost_after_cents).toBe(
    30 * ((rankUnitCents(10, "dataforseo") ?? 0) + (rankUnitCents(50, "dataforseo") ?? 0)),
  );
  expect(preview.requires_review).toBe(true);
});

it.each(["manual", "paused"] as const)(
  "does not review a %s destination with an explicit provider policy",
  async (frequency) => {
    mocks.target.mockResolvedValue({ ...target, frequency });
    const preview = await previewScheduleChange(
      "project",
      actor,
      keywordCreateChange({ ...input, checkScheduleId: target.publicId }),
    );
    expect(preview.requires_review).toBe(false);
    expect(preview.cost_after_cents).toBe(0);
    expect(preview.capacity).toMatchObject({ dimensions: { scheduledKeywords: { projected: 7 } } });
  },
);

import { marketCreateChange, marketDevicesChange } from "@/lib/markets/create-review-change";

const marketInput = {
  projectId: `prj_${"a".repeat(24)}`,
  canonicalKey: "US",
  countryCode: "US",
  kind: "country" as const,
  languageCode: "en",
  devices: ["desktop" as const, "mobile" as const],
  method: { kind: "paste" as const, text: "rank\nseo" },
  schedule: { kind: "existing" as const, scheduleId: target.publicId },
};
it("market source uses canonical tuple pricing and capacity without trusting injected tuples", async () => {
  const change = marketCreateChange(marketInput);
  const preview = await previewScheduleChange("project", actor, {
    ...change,
    keywords: [{ keyword: "forged", device: "mobile", locationKey: "US" }],
  });
  const same = await previewScheduleChange(
    "project",
    actor,
    keywordCreateChange({
      ...input,
      devices: marketInput.devices,
      checkScheduleId: target.publicId,
    }),
  );
  expect(preview.cost_after_cents).toBe(same.cost_after_cents);
  expect(preview.capacity).toMatchObject({ dimensions: { scheduledKeywords: { projected: 11 } } });
  const changed = await previewScheduleChange(
    "project",
    actor,
    marketCreateChange({ ...marketInput, method: { kind: "paste", text: "rank | /changed\nseo" } }),
  );
  expect(changed.expected_revision).not.toBe(preview.expected_revision);
});
it("device source prices only missing device tuples and projects the same scheduled capacity", async () => {
  mocks.market.mockResolvedValue({ locationId: "US", location: { canonicalKey: "US" } });
  mocks.keywords.mockImplementation(async (query) =>
    query.where.OR
      ? []
      : [
          {
            publicId: `kw_${"a".repeat(24)}`,
            text: "rank",
            device: "desktop",
            archivedAt: null,
            targetUrl: "/target",
            topic: null,
            intent: null,
            tags: [],
          },
        ],
  );
  const change = marketDevicesChange({
    projectId: marketInput.projectId,
    marketId: `pmkt_${"a".repeat(24)}`,
    device: "mobile",
    scheduleId: target.publicId,
  });
  const preview = await previewScheduleChange("project", actor, change);
  expect(preview.requires_review).toBe(true);
  expect(preview.capacity).toMatchObject({ dimensions: { scheduledKeywords: { projected: 8 } } });
  mocks.market.mockResolvedValue(null);
  await expect(previewScheduleChange("project", actor, change)).rejects.toMatchObject({
    code: "schedule_review_stale",
  });
});
