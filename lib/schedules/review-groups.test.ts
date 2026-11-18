import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewScheduleChange } from "./preview";

const now = new Date("2026-10-08T12:00:00.000Z");
const mocks = vi.hoisted(() => ({ keywords: vi.fn(), rank: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    checkSchedule: { findFirst: mocks.rank },
    keyword: { findMany: mocks.keywords },
    projectDefaults: { findUnique: vi.fn(async () => ({ serpDepth: 20, timezone: "UTC" })) },
    providerConnection: { findFirst: vi.fn(async () => null) },
  },
}));

const actor = { id: "user_1", memberships: [] };
const weeklyId = "sch_a00000000000000000000000" as const;

function schedule(publicId: string, frequency: "daily" | "monthly" | "weekly") {
  return {
    archivedAt: null,
    cronExpression: null,
    enabled: true,
    frequency,
    jitterMinutes: 0,
    measurementEpoch: 2n,
    providerPolicy: "dataforseo",
    publicId,
    serpDepth: 20,
    timeOfDay: null,
    timezone: "UTC",
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  };
}

function keyword(publicId: string, frequency: "daily" | "monthly") {
  return {
    checkSchedule: schedule(`sch_${publicId}`, frequency),
    id: publicId,
    measurementTargetEpoch: 1n,
    publicId: `kw_${publicId}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rank.mockResolvedValue(schedule(weeklyId, "weekly"));
});

describe("mixed keyword groups", () => {
  it("requires review when one daily keyword and ten monthly keywords move to weekly", async () => {
    mocks.keywords.mockResolvedValue([
      keyword("dailykeyword000000000000", "daily"),
      ...Array.from({ length: 10 }, (_item, index) =>
        keyword(`monthlykeyword${String(index).padStart(10, "0")}`, "monthly"),
      ),
    ]);
    const preview = await previewScheduleChange(
      "project_1",
      actor,
      {
        keywordIds: ["kw_dailykeyword000000000000"],
        op: "keywords",
        scheduleId: weeklyId,
      },
      now,
    );
    expect(preview.requires_review).toBe(true);
    expect(preview.cost_before_cents).not.toBeNull();
    expect(preview.cost_after_cents).toBeGreaterThan(preview.cost_before_cents ?? 0);
  });

  it("reports the current cost when keywords leave their schedule", async () => {
    mocks.keywords.mockResolvedValue([keyword("dailykeyword000000000000", "daily")]);
    const preview = await previewScheduleChange(
      "project_1",
      actor,
      {
        keywordIds: ["kw_dailykeyword000000000000"],
        op: "keywords",
        scheduleId: null,
      },
      now,
    );
    expect(preview.cost_before_cents).toBeGreaterThan(0);
    expect(preview.cost_after_cents).toBe(0);
    expect(preview.requires_review).toBe(false);
  });
});
