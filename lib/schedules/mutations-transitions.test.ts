import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleTransitionError } from "./errors";
import { setScheduleState } from "./mutations";
import { WEB_UNGATED_REVIEW } from "./review-commit";

const mocks = vi.hoisted(() => ({
  ai: vi.fn(),
  archive: vi.fn(),
  assign: vi.fn(),
  audit: vi.fn(),
  catalog: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  project: vi.fn(),
  rank: vi.fn(),
  remove: vi.fn(),
  restoreAi: vi.fn(),
  restoreRank: vi.fn(),
  update: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/ai-tracking-service", () => ({ mutateTrackingCatalog: mocks.catalog }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiTrackingSchedule: { findFirst: mocks.ai },
    checkSchedule: { findFirst: mocks.rank },
    project: { findFirst: mocks.project },
  },
}));
vi.mock("@/lib/ai-tracking/stores/schedules", () => ({
  restoreSchedule: mocks.restoreAi,
}));
vi.mock("@/lib/rank-check/schedules/service", () => ({
  CheckScheduleNotEmptyError: class CheckScheduleNotEmptyError extends Error {
    readonly code = "check_schedule_not_empty";
    constructor() {
      super("Move or remove all keywords before deleting this schedule.");
      this.name = "CheckScheduleNotEmptyError";
    }
  },
  createSchedule: mocks.create,
  deleteSchedule: mocks.delete,
  updateSchedule: mocks.update,
}));
vi.mock("@/lib/rank-check/schedules/archive", () => ({
  archiveSchedule: mocks.archive,
  restoreSchedule: mocks.restoreRank,
}));
vi.mock("@/lib/rank-check/schedules/service-membership", () => ({
  assignKeywordsToSchedule: mocks.assign,
  removeKeywordsFromSchedule: mocks.remove,
}));

const actor = { id: "user_1", memberships: [] };
const projectId = "prj_a00000000000000000000000" as const;
const scheduleId = "sch_a00000000000000000000000" as const;

const aiRow = {
  archivedAt: null as Date | null,
  enabled: true,
  id: "internal_ai",
  publicId: "ais_weekly",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rank.mockResolvedValue({ archivedAt: null, enabled: true });
  mocks.ai.mockResolvedValue(aiRow);
  mocks.project.mockResolvedValue({ publicId: projectId });
  mocks.restoreAi.mockImplementation(async (_projectId, _scheduleId, onRestored) => {
    const row = {
      archivedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      cron: "0 9 * * 1",
      enabled: false,
      name: "Weekly",
      nextRunAt: null,
      publicId: "ais_weekly",
      timezone: "UTC",
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };
    if (onRestored) {
      await onRestored({ project: { findFirst: mocks.project } } as never, row);
    }
    return row;
  });
});
describe("schedule state transitions", () => {
  it("restores an archived rank schedule to paused and refuses a direct activation", async () => {
    mocks.rank.mockResolvedValue({ archivedAt: new Date("2026-01-01T00:00:00Z"), enabled: false });
    await setScheduleState(
      "project_1",
      actor,
      scheduleId,
      "paused",
      {
        kind: "rank",
        projectPublicId: projectId,
        restore: true,
      },
      WEB_UNGATED_REVIEW,
    );
    expect(mocks.restoreRank).toHaveBeenCalledWith("user_1", "project_1", scheduleId);
    expect(mocks.update).not.toHaveBeenCalled();
    await expect(
      setScheduleState(
        "project_1",
        actor,
        scheduleId,
        "active",
        {
          kind: "rank",
          projectPublicId: projectId,
        },
        WEB_UNGATED_REVIEW,
      ),
    ).rejects.toBeInstanceOf(ScheduleTransitionError);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns the current archived projection without writing again", async () => {
    mocks.rank.mockResolvedValue({ archivedAt: new Date("2026-01-01T00:00:00Z"), enabled: false });
    mocks.ai.mockResolvedValue({
      ...aiRow,
      archivedAt: new Date("2026-01-01T00:00:00Z"),
      enabled: false,
    });
    await expect(
      setScheduleState(
        "project_1",
        actor,
        scheduleId,
        "archived",
        {
          kind: "rank",
          projectPublicId: projectId,
        },
        WEB_UNGATED_REVIEW,
      ),
    ).resolves.toEqual({ changed: false, publicId: scheduleId });
    await expect(
      setScheduleState(
        "project_1",
        actor,
        "ais_weekly",
        "archived",
        { kind: "ai" },
        WEB_UNGATED_REVIEW,
      ),
    ).resolves.toMatchObject({ publicId: "ais_weekly", unchanged: true });
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("restores an archived AI schedule to paused and refuses activation", async () => {
    mocks.ai.mockResolvedValue({
      ...aiRow,
      archivedAt: new Date("2026-01-01T00:00:00Z"),
      enabled: false,
    });
    const restored = await setScheduleState(
      "project_1",
      actor,
      "ais_weekly",
      "paused",
      {
        kind: "ai",
        restore: true,
      },
      WEB_UNGATED_REVIEW,
    );
    expect(mocks.restoreAi).toHaveBeenCalledWith("project_1", "internal_ai", expect.any(Function));
    expect(restored).toMatchObject({ enabled: false, id: "ais_weekly" });
    expect(restored).not.toHaveProperty("projectId");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai_tracking.schedule.restore",
        after: { resourceId: "ais_weekly" },
        targetId: projectId,
      }),
      expect.objectContaining({ project: { findFirst: mocks.project } }),
    );
    expect(mocks.catalog).not.toHaveBeenCalled();
    await expect(
      setScheduleState(
        "project_1",
        actor,
        "ais_weekly",
        "active",
        { kind: "ai" },
        WEB_UNGATED_REVIEW,
      ),
    ).rejects.toBeInstanceOf(ScheduleTransitionError);
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it("returns the current projection when restore targets a schedule that is not archived", async () => {
    await expect(
      setScheduleState(
        "project_1",
        actor,
        scheduleId,
        "paused",
        {
          kind: "rank",
          projectPublicId: projectId,
          restore: true,
        },
        WEB_UNGATED_REVIEW,
      ),
    ).resolves.toEqual({ changed: false, publicId: scheduleId });
    await expect(
      setScheduleState(
        "project_1",
        actor,
        "ais_weekly",
        "paused",
        {
          kind: "ai",
          restore: true,
        },
        WEB_UNGATED_REVIEW,
      ),
    ).resolves.toMatchObject({ id: "ais_weekly", publicId: "ais_weekly", unchanged: true });
    expect(mocks.restoreRank).not.toHaveBeenCalled();
    expect(mocks.restoreAi).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("refuses to pause an archived rank or AI schedule without an explicit restore", async () => {
    mocks.rank.mockResolvedValue({ archivedAt: new Date("2026-01-01T00:00:00Z"), enabled: false });
    mocks.ai.mockResolvedValue({
      ...aiRow,
      archivedAt: new Date("2026-01-01T00:00:00Z"),
      enabled: false,
    });
    await expect(
      setScheduleState(
        "project_1",
        actor,
        scheduleId,
        "paused",
        {
          kind: "rank",
          projectPublicId: projectId,
        },
        WEB_UNGATED_REVIEW,
      ),
    ).rejects.toBeInstanceOf(ScheduleTransitionError);
    await expect(
      setScheduleState(
        "project_1",
        actor,
        "ais_weekly",
        "paused",
        { kind: "ai" },
        WEB_UNGATED_REVIEW,
      ),
    ).rejects.toBeInstanceOf(ScheduleTransitionError);
    expect(mocks.restoreRank).not.toHaveBeenCalled();
    expect(mocks.restoreAi).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
