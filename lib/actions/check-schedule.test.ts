import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignKeywordsToCheckSchedule,
  createCheckSchedule,
  deleteCheckSchedule,
  removeKeywordsFromCheckSchedule,
  updateCheckSchedule,
} from "./check-schedule";

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  getActionActor: vi.fn(),
  rank: vi.fn(),
  record: vi.fn(),
  remove: vi.fn(),
  requireProjectScope: vi.fn(),
  update: vi.fn(),
}));

vi.mock("./_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (_schema: unknown, input: unknown) => input,
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/rank-check/schedules/service", () => ({
  createSchedule: mocks.create,
  deleteSchedule: mocks.delete,
  updateSchedule: mocks.update,
}));
vi.mock("@/lib/rank-check/schedules/service-membership", () => ({
  assignKeywordsToSchedule: mocks.assign,
  removeKeywordsFromSchedule: mocks.remove,
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.record }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    checkSchedule: { findFirst: mocks.rank },
  },
}));

const projectId = `prj_${"a".repeat(24)}`;
const scheduleId = `sch_${"b".repeat(24)}`;
const keywordId = `kw_${"c".repeat(24)}`;

describe("check schedule actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assign.mockResolvedValue({ updated: 1 });
    mocks.remove.mockResolvedValue({ updated: 1 });
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.rank.mockResolvedValue({ archivedAt: null, enabled: true });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1" });
  });

  it("uses update authorization for create, update, assign, and remove", async () => {
    await createCheckSchedule({ frequency: "daily", name: "Daily", projectId });
    await updateCheckSchedule({ enabled: false, projectId, scheduleId });
    await assignKeywordsToCheckSchedule({ keywordIds: [keywordId], projectId, scheduleId });
    await removeKeywordsFromCheckSchedule({ keywordIds: [keywordId], projectId, scheduleId });

    expect(mocks.update).toHaveBeenCalledWith(
      "user_1",
      "project_1",
      expect.objectContaining({ enabled: false, projectId, scheduleId }),
    );
    expect(mocks.requireProjectScope).toHaveBeenCalledTimes(4);
    for (const call of mocks.requireProjectScope.mock.calls) {
      expect(call).toEqual([{ id: "user_1" }, "update", projectId, { type: "check_schedule" }]);
    }
  });

  it.each([{ enabled: true }, { enabled: true, name: "Renamed" }])(
    "refuses to enable an archived rank schedule with %j and writes nothing",
    async (patch) => {
      mocks.rank.mockResolvedValue({
        archivedAt: new Date("2026-01-01T00:00:00Z"),
        enabled: false,
      });
      await expect(updateCheckSchedule({ ...patch, projectId, scheduleId })).resolves.toMatchObject(
        { ok: false, error: { code: "schedule_transition_invalid", status: 409 } },
      );
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.record).not.toHaveBeenCalled();
    },
  );

  it("refuses to pause an archived rank schedule and writes nothing", async () => {
    mocks.rank.mockResolvedValue({
      archivedAt: new Date("2026-01-01T00:00:00Z"),
      enabled: false,
    });
    await expect(
      updateCheckSchedule({ enabled: false, projectId, scheduleId }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "schedule_transition_invalid", status: 409 },
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("uses manage authorization for deletion", async () => {
    await deleteCheckSchedule({ projectId, scheduleId });

    expect(mocks.requireProjectScope.mock.calls).toEqual([
      [{ id: "user_1" }, "manage", projectId, { type: "check_schedule" }],
    ]);
    expect(mocks.delete).toHaveBeenCalledWith("user_1", "project_1", scheduleId);
  });
});

vi.mock("@/lib/schedules/review-load", async () => ({
  loadScheduleSpend: (await import("@/lib/schedules/review-noop.test-fixture")).loadNoScheduleSpend,
}));
