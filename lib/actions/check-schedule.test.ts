import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignKeywordsToCheckSchedule,
  createCheckSchedule,
  deleteCheckSchedule,
  removeKeywordsFromCheckSchedule,
  setDefaultCheckSchedule,
  updateCheckSchedule,
} from "./check-schedule";

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  getActionActor: vi.fn(),
  remove: vi.fn(),
  requireProjectScope: vi.fn(),
  setDefault: vi.fn(),
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
  setDefaultSchedule: mocks.setDefault,
  updateSchedule: mocks.update,
}));
vi.mock("@/lib/rank-check/schedules/service-membership", () => ({
  assignKeywordsToSchedule: mocks.assign,
  removeKeywordsFromSchedule: mocks.remove,
}));

const projectId = `prj_${"a".repeat(24)}`;
const scheduleId = `sch_${"b".repeat(24)}`;
const keywordId = `kw_${"c".repeat(24)}`;

describe("check schedule actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1" });
  });

  it("uses update authorization for create, update, assign, and remove", async () => {
    await createCheckSchedule({ frequency: "daily", name: "Daily", projectId });
    await updateCheckSchedule({ enabled: false, projectId, scheduleId });
    await assignKeywordsToCheckSchedule({ keywordIds: [keywordId], projectId, scheduleId });
    await removeKeywordsFromCheckSchedule({ keywordIds: [keywordId], projectId, scheduleId });

    expect(mocks.requireProjectScope).toHaveBeenCalledTimes(4);
    for (const call of mocks.requireProjectScope.mock.calls) {
      expect(call).toEqual([{ id: "user_1" }, "update", projectId, { type: "check_schedule" }]);
    }
  });

  it("uses manage authorization for default changes and deletion", async () => {
    await setDefaultCheckSchedule({ projectId, scheduleId });
    await deleteCheckSchedule({ projectId, scheduleId });

    expect(mocks.requireProjectScope.mock.calls).toEqual([
      [{ id: "user_1" }, "manage", projectId, { type: "check_schedule" }],
      [{ id: "user_1" }, "manage", projectId, { type: "check_schedule" }],
    ]);
    expect(mocks.setDefault).toHaveBeenCalledWith("user_1", "project_1", scheduleId);
    expect(mocks.delete).toHaveBeenCalledWith("user_1", "project_1", scheduleId);
  });
});
