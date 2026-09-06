import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  assign: vi.fn(),
  audit: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  requireScope: vi.fn(),
  setDefault: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/app-route", () => ({
  withAppRoute:
    (handler: (request: Request, actor: typeof mocks.actor, context?: unknown) => unknown) =>
    async (request: Request, context?: unknown) => {
      try {
        return await handler(request, mocks.actor, context);
      } catch (error) {
        if (error instanceof Error && error.name === "ZodError") {
          return new Response("Request validation failed.", { status: 400 });
        }
        throw error;
      }
    },
}));
vi.mock("@/lib/actions/_shared", () => ({ requireProjectScope: mocks.requireScope }));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getCheckSchedule: mocks.get,
  listCheckSchedules: mocks.list,
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

import { POST as assignKeywords, DELETE as removeKeywords } from "./[publicId]/keywords/route";
import { DELETE as deleteScheduleRoute, GET as getSchedule, PATCH } from "./[publicId]/route";
import { POST as setDefault } from "./[publicId]/set-default/route";
import { POST as createScheduleRoute, GET as listSchedules } from "./route";

const projectId = "prj_a00000000000000000000000";
const scheduleId = "sch_a00000000000000000000000";
const keywordId = "kw_a00000000000000000000000";
const context = { params: Promise.resolve({ publicId: scheduleId }) };

function jsonRequest(method: string, body: object, path = "/api/check-schedules") {
  return new Request(`https://example.com${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method,
  });
}

describe("check schedule app routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    for (const service of [
      mocks.assign,
      mocks.create,
      mocks.delete,
      mocks.remove,
      mocks.setDefault,
      mocks.update,
    ]) {
      service.mockResolvedValue({ publicId: scheduleId });
    }
    mocks.list.mockResolvedValue([]);
    mocks.get.mockResolvedValue({ publicId: scheduleId });
  });

  it("uses read scope and query functions for list and detail", async () => {
    await listSchedules(
      new Request(`https://example.com/api/check-schedules?project=${projectId}`),
    );
    await getSchedule(
      new Request(`https://example.com/api/check-schedules/${scheduleId}?project=${projectId}`),
      context,
    );

    expect(mocks.requireScope).toHaveBeenNthCalledWith(
      1,
      mocks.actor,
      "read",
      projectId,
      { type: "check_schedule" },
      { allowReadOnly: true },
    );
    expect(mocks.requireScope).toHaveBeenNthCalledWith(
      2,
      mocks.actor,
      "read",
      projectId,
      { type: "check_schedule" },
      { allowReadOnly: true },
    );
    expect(mocks.list).toHaveBeenCalledWith("project_1");
    expect(mocks.get).toHaveBeenCalledWith("project_1", scheduleId);
  });

  it("calls create and update services at update scope", async () => {
    await createScheduleRoute(
      jsonRequest("POST", { frequency: "manual", jitterMinutes: 60, name: "Manual", projectId }),
    );
    await PATCH(jsonRequest("PATCH", { name: "Renamed", projectId }), context);

    expect(mocks.create).toHaveBeenCalledWith(
      "user_1",
      "project_1",
      expect.objectContaining({ name: "Manual", projectId }),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      "user_1",
      "project_1",
      expect.objectContaining({ name: "Renamed", projectId, scheduleId }),
    );
    expect(mocks.requireScope.mock.calls.map((call) => call[1])).toEqual(["update", "update"]);
  });

  it("rejects a typo in a patch without writing an audit row", async () => {
    mocks.update.mockImplementation(async () => {
      mocks.audit();
      return { publicId: scheduleId };
    });

    const response = await PATCH(jsonRequest("PATCH", { enabeld: false, projectId }), context);

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("uses manage scope for set-default and delete", async () => {
    await setDefault(jsonRequest("POST", { projectId }), context);
    await deleteScheduleRoute(jsonRequest("DELETE", { projectId }), context);

    expect(mocks.setDefault).toHaveBeenCalledWith("user_1", "project_1", scheduleId);
    expect(mocks.delete).toHaveBeenCalledWith("user_1", "project_1", scheduleId);
    expect(mocks.requireScope.mock.calls.map((call) => call[1])).toEqual(["manage", "manage"]);
  });

  it("assigns and removes keywords through membership services at update scope", async () => {
    const body = { keywordIds: [keywordId], projectId };
    await assignKeywords(jsonRequest("POST", body), context);
    await removeKeywords(jsonRequest("DELETE", body), context);

    expect(mocks.assign).toHaveBeenCalledWith(
      "user_1",
      "project_1",
      expect.objectContaining({ ...body, scheduleId }),
    );
    expect(mocks.remove).toHaveBeenCalledWith(
      "user_1",
      "project_1",
      expect.objectContaining({ ...body, scheduleId }),
    );
    expect(mocks.requireScope.mock.calls.map((call) => call[1])).toEqual(["update", "update"]);
  });
});
