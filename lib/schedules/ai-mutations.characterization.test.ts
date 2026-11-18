import { CapacityLimitError } from "@/lib/capacity/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  audit: vi.fn(),
  capacity: vi.fn(),
  record: vi.fn(),
  scope: vi.fn(),
  schedule: {
    archivedAt: null as Date | null,
    configuration: { promptIds: ["prompt_1"] },
    createdAt: new Date("2026-10-01T00:00:00Z"),
    cron: "0 9 * * 1",
    enabled: true,
    id: "internal_schedule",
    name: "Weekly",
    nextRunAt: new Date("2026-10-20T09:00:00Z"),
    projectId: "project",
    publicId: "ais_saved0000000000000000000",
    timezone: "UTC",
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.record }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.actor,
  requireProjectScope: mocks.scope,
}));
vi.mock("@/lib/capacity/capacity-extension", () => ({
  prepareResourceCapacity: mocks.capacity,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiProjectEngine: { findMany: async () => [] },
    aiPrompt: { findMany: async () => [] },
    aiTopic: { findMany: async () => [] },
    aiTrackingRun: { findMany: async () => [] },
    aiTrackingSchedule: {
      findFirst: async () => mocks.schedule,
      findMany: async () => [mocks.schedule],
    },
    $transaction: async (execute: (tx: unknown) => Promise<unknown>) =>
      execute({
        $queryRaw: async () => [],
        project: { findUnique: async () => ({ id: "project" }) },
        aiTrackingSchedule: {
          findFirst: async () => mocks.schedule,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            Object.assign(
              mocks.schedule,
              Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
            );
            return mocks.schedule;
          },
        },
      }),
  },
}));

import { mutateAiTrackingAction } from "@/lib/actions/ai-tracking";

const actor = {
  id: "editor",
  memberships: [{ projectId: "project", role: "admin" as const }],
};

beforeEach(() => {
  mocks.schedule.enabled = true;
  mocks.schedule.archivedAt = null;
  mocks.schedule.name = "Weekly";
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue(actor);
  mocks.scope.mockResolvedValue({
    domain: "example.com",
    id: "project",
    publicId: "prj_a00000000000000000000000",
    writeMode: "active",
  });
  mocks.capacity.mockResolvedValue({ check: async () => undefined });
});

describe("AI schedule action mutations", () => {
  it("pauses with a disable audit and archives with an archive audit", async () => {
    await mutateAiTrackingAction(
      "prj_a00000000000000000000000",
      "schedules",
      "PATCH",
      { enabled: false },
      "ais_saved0000000000000000000",
    );
    expect(mocks.schedule.enabled).toBe(false);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai_tracking.schedule.disable" }),
    );
    mocks.audit.mockClear();
    await mutateAiTrackingAction(
      "prj_a00000000000000000000000",
      "schedules",
      "DELETE",
      {},
      "ais_saved0000000000000000000",
    );
    expect(mocks.schedule.archivedAt).toBeInstanceOf(Date);
    expect(mocks.schedule.enabled).toBe(false);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai_tracking.schedule.archive" }),
    );
  });

  it.each([{ enabled: true }, { enabled: true, name: "Renamed" }])(
    "refuses to enable an archived AI schedule with %j and writes nothing",
    async (patch) => {
      mocks.schedule.archivedAt = new Date("2026-01-01T00:00:00Z");
      mocks.schedule.enabled = false;
      await expect(
        mutateAiTrackingAction(
          "prj_a00000000000000000000000",
          "schedules",
          "PATCH",
          patch,
          "ais_saved0000000000000000000",
        ),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "schedule_transition_invalid", status: 409 },
      });
      expect(mocks.schedule.enabled).toBe(false);
      expect(mocks.audit).not.toHaveBeenCalled();
      expect(mocks.record).not.toHaveBeenCalled();
    },
  );

  it("refuses to pause an archived AI schedule and writes nothing", async () => {
    mocks.schedule.archivedAt = new Date("2026-01-01T00:00:00Z");
    mocks.schedule.enabled = false;
    await expect(
      mutateAiTrackingAction(
        "prj_a00000000000000000000000",
        "schedules",
        "PATCH",
        { enabled: false },
        "ais_saved0000000000000000000",
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "schedule_transition_invalid", status: 409 },
    });
    expect(mocks.schedule.archivedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(mocks.schedule.enabled).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("does not write when an archived AI schedule is archived again", async () => {
    const archivedAt = new Date("2026-01-01T00:00:00Z");
    mocks.schedule.archivedAt = archivedAt;
    mocks.schedule.enabled = false;
    await mutateAiTrackingAction(
      "prj_a00000000000000000000000",
      "schedules",
      "DELETE",
      {},
      "ais_saved0000000000000000000",
    );
    expect(mocks.schedule.archivedAt).toBe(archivedAt);
    expect(mocks.schedule.enabled).toBe(false);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("denies a viewer before opening a schedule transaction", async () => {
    mocks.scope.mockRejectedValue(new Error("Forbidden"));
    await expect(
      mutateAiTrackingAction(
        "prj_a00000000000000000000000",
        "schedules",
        "PATCH",
        { name: "Renamed" },
        "ais_saved0000000000000000000",
      ),
    ).rejects.toThrow("Forbidden");
    expect(mocks.schedule.name).toBe("Weekly");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("returns a plan capacity refusal instead of saving the schedule", async () => {
    mocks.capacity.mockRejectedValue(
      new CapacityLimitError({
        dimension: "promptSchedules",
        limit: 1,
        requested: 1,
        scope: "project",
        used: 1,
      }),
    );
    await expect(
      mutateAiTrackingAction(
        "prj_a00000000000000000000000",
        "schedules",
        "PATCH",
        { enabled: false },
        "ais_saved0000000000000000000",
      ),
    ).resolves.toMatchObject({ capacityFailure: { code: "plan_limit_reached" } });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

// Preserve scope/store characterizations with an explicit no-spend admission fixture.
vi.mock("@/lib/schedules/review-load", async () => ({
  loadScheduleSpend: (await import("@/lib/schedules/review-noop.test-fixture")).loadNoScheduleSpend,
}));
