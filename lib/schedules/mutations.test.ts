import { CheckScheduleNotEmptyError } from "@/lib/rank-check/schedules/service";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleTransitionError } from "./errors";
import {
  createSchedule,
  deleteSchedule,
  mutateAiSchedule,
  setScheduleState,
  updateSchedule,
} from "./mutations";
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
const rankInput = {
  cronExpression: null,
  frequency: "daily" as const,
  jitterMinutes: 60,
  name: "Daily",
  projectId,
};

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

describe("rank and AI schedule mutations", () => {
  it("creates only rank and AI schedules through their existing stores", async () => {
    await createSchedule(
      "project_1",
      actor,
      { kind: "rank", input: rankInput },
      WEB_UNGATED_REVIEW,
    );
    await createSchedule(
      "project_1",
      actor,
      {
        kind: "ai",
        input: { configuration: {}, cron: "0 9 * * 1", name: "Weekly", timezone: "UTC" } as never,
      },
      WEB_UNGATED_REVIEW,
    );
    expect(mocks.create).toHaveBeenCalledWith("user_1", "project_1", rankInput);
    expect(mocks.catalog).toHaveBeenCalledWith(
      "project_1",
      "schedules",
      "POST",
      expect.objectContaining({ name: "Weekly" }),
    );
    await expect(
      createSchedule("project_1", actor, { kind: "local_monitor" } as never, WEB_UNGATED_REVIEW),
    ).rejects.toMatchObject({ code: "schedule_create_unsupported" });
  });

  it("refuses an archived rank or AI schedule when enabled arrives with other fields", async () => {
    mocks.rank.mockResolvedValue({ archivedAt: new Date("2026-01-01T00:00:00Z"), enabled: false });
    mocks.ai.mockResolvedValue({
      ...aiRow,
      archivedAt: new Date("2026-01-01T00:00:00Z"),
      enabled: false,
    });
    await expect(
      updateSchedule(
        "project_1",
        actor,
        scheduleId,
        {
          input: { ...rankInput, enabled: true, name: "Renamed", scheduleId },
          kind: "rank",
        },
        WEB_UNGATED_REVIEW,
      ),
    ).rejects.toBeInstanceOf(ScheduleTransitionError);
    await expect(
      updateSchedule(
        "project_1",
        actor,
        "ais_weekly",
        {
          input: { enabled: true, name: "Renamed" },
          kind: "ai",
        },
        WEB_UNGATED_REVIEW,
      ),
    ).rejects.toBeInstanceOf(ScheduleTransitionError);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it("updates rank fields and keyword targets without a second controller", async () => {
    const patch = { ...rankInput, scheduleId };
    const membership = {
      keywordIds: ["kw_a00000000000000000000000" as const],
      projectId,
      scheduleId,
    };
    await updateSchedule(
      "project_1",
      actor,
      scheduleId,
      { kind: "rank", input: patch },
      WEB_UNGATED_REVIEW,
    );
    await updateSchedule(
      "project_1",
      actor,
      scheduleId,
      {
        kind: "rank-membership",
        membership,
        operation: "assign",
      },
      WEB_UNGATED_REVIEW,
    );
    await updateSchedule(
      "project_1",
      actor,
      scheduleId,
      {
        kind: "rank-membership",
        membership,
        operation: "remove",
      },
      WEB_UNGATED_REVIEW,
    );
    expect(mocks.update).toHaveBeenCalledWith("user_1", "project_1", patch);
    expect(mocks.assign).toHaveBeenCalledWith("user_1", "project_1", membership);
    expect(mocks.remove).toHaveBeenCalledWith("user_1", "project_1", membership);
  });

  it("deletes only through the empty rank schedule guard", async () => {
    mocks.delete.mockRejectedValueOnce(new CheckScheduleNotEmptyError());
    await expect(
      deleteSchedule("project_1", actor, scheduleId, WEB_UNGATED_REVIEW),
    ).rejects.toMatchObject({
      code: "check_schedule_not_empty",
    });
    mocks.delete.mockResolvedValueOnce({ deleted: true });
    await expect(
      deleteSchedule("project_1", actor, scheduleId, WEB_UNGATED_REVIEW),
    ).resolves.toEqual({
      deleted: true,
    });
    expect(mocks.delete).toHaveBeenCalledWith("user_1", "project_1", scheduleId);
  });

  it("pauses, archives, and updates AI schedules through the tracking catalog", async () => {
    await setScheduleState(
      "project_1",
      actor,
      "ais_weekly",
      "paused",
      { kind: "ai" },
      WEB_UNGATED_REVIEW,
    );
    await setScheduleState(
      "project_1",
      actor,
      "ais_weekly",
      "archived",
      { kind: "ai" },
      WEB_UNGATED_REVIEW,
    );
    await updateSchedule(
      "project_1",
      actor,
      "ais_weekly",
      {
        input: { name: "Renamed" },
        kind: "ai",
      },
      WEB_UNGATED_REVIEW,
    );
    expect(mocks.catalog).toHaveBeenNthCalledWith(
      1,
      "project_1",
      "schedules",
      "PATCH",
      {
        enabled: false,
      },
      "ais_weekly",
    );
    expect(mocks.catalog).toHaveBeenNthCalledWith(
      2,
      "project_1",
      "schedules",
      "DELETE",
      {},
      "ais_weekly",
    );
    expect(mocks.catalog).toHaveBeenNthCalledWith(
      3,
      "project_1",
      "schedules",
      "PATCH",
      { name: "Renamed" },
      "ais_weekly",
    );
  });

  it("forwards the caller's archive value to the tracking catalog", async () => {
    await mutateAiSchedule(
      "project_1",
      actor,
      "DELETE",
      { source: "drawer" },
      "ais_weekly",
      WEB_UNGATED_REVIEW,
    );
    expect(mocks.catalog).toHaveBeenCalledWith(
      "project_1",
      "schedules",
      "DELETE",
      { source: "drawer" },
      "ais_weekly",
    );
  });
});
