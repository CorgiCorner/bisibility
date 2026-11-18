import { AuthorizationError } from "@/lib/auth/authorize";
import { CapacityLimitError } from "@/lib/capacity/errors";
import { CheckScheduleNotEmptyError } from "@/lib/rank-check/schedules/service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  keyword: "kw_a00000000000000000000000",
  project: "prj_a00000000000000000000000",
  schedule: "sch_a00000000000000000000000",
};
const actor = { id: "user_1", memberships: [{ projectId: "project_1", role: "admin" as const }] };
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  archive: vi.fn(),
  assign: vi.fn(),
  audit: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  pause: vi.fn(),
  rank: vi.fn(),
  record: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  scope: vi.fn(),
  session: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.session, requireSession: mocks.session }));
vi.mock("@/lib/actions/_shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions/_shared")>();
  return { ...actual, getActionActor: mocks.actor, requireProjectScope: mocks.scope };
});
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.record }));
vi.mock("@/lib/api/admission-error-details", () => ({
  appAdmissionErrorDetails: async () => null,
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
  restoreSchedule: mocks.restore,
}));
vi.mock("@/lib/rank-check/schedules/service-membership", () => ({
  assignKeywordsToSchedule: mocks.assign,
  removeKeywordsFromSchedule: mocks.remove,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    checkSchedule: { findFirst: mocks.rank },
  },
}));
vi.mock("@/lib/local-monitor-recurring/service", () => ({
  approveRecurringFor: vi.fn(),
  pauseRecurringFor: mocks.pause,
  previewRecurringFor: vi.fn(),
  restoreRecurringFor: vi.fn(),
}));

import { POST as archiveRoute } from "@/app/api/check-schedules/[publicId]/archive/route";
import {
  POST as assignRoute,
  DELETE as removeRoute,
} from "@/app/api/check-schedules/[publicId]/keywords/route";
import { POST as restoreRoute } from "@/app/api/check-schedules/[publicId]/restore/route";
import {
  DELETE as deleteRoute,
  PATCH as updateRoute,
} from "@/app/api/check-schedules/[publicId]/route";
import { POST as createRoute } from "@/app/api/check-schedules/route";
import { pauseRecurringMonitorAction } from "@/lib/local-monitor-recurring/session-actions";

const context = { params: Promise.resolve({ publicId: ids.schedule }) };

function json(method: string, body: object, path = "/api/check-schedules") {
  return new Request(`https://example.com${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method,
  });
}

describe("rank schedule route mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rank.mockResolvedValue({
      archivedAt: new Date("2026-01-01T00:00:00.000Z"),
      enabled: false,
    });
    mocks.session.mockResolvedValue({ user: { id: "user_1" } });
    mocks.actor.mockResolvedValue(actor);
    mocks.scope.mockResolvedValue({ id: "project_1", publicId: ids.project });
    for (const call of [
      mocks.archive,
      mocks.assign,
      mocks.create,
      mocks.remove,
      mocks.restore,
      mocks.update,
    ])
      call.mockResolvedValue({ publicId: ids.schedule });
    mocks.delete.mockResolvedValue({ deleted: true });
  });

  it("creates and updates at update scope through the schedule service", async () => {
    const created = await createRoute(
      json("POST", {
        frequency: "manual",
        jitterMinutes: 60,
        name: "Manual",
        projectId: ids.project,
      }),
    );
    const updated = await updateRoute(
      json("PATCH", { name: "Renamed", projectId: ids.project }),
      context,
    );
    expect(created.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      "user_1",
      "project_1",
      expect.objectContaining({ name: "Manual", projectId: ids.project }),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      "user_1",
      "project_1",
      expect.objectContaining({
        name: "Renamed",
        projectId: ids.project,
        scheduleId: ids.schedule,
      }),
    );
    expect(mocks.scope.mock.calls.map((call) => call[1])).toEqual(["update", "update"]);
  });

  it.each([{ enabled: true }, { enabled: true, name: "Renamed" }])(
    "refuses to enable an archived rank schedule with %j and writes nothing",
    async (patch) => {
      const response = await updateRoute(
        json("PATCH", { ...patch, projectId: ids.project }),
        context,
      );
      expect(response.status).toBe(409);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.restore).not.toHaveBeenCalled();
      expect(mocks.record).not.toHaveBeenCalled();
    },
  );

  it("refuses to pause an archived rank schedule and writes nothing", async () => {
    const response = await updateRoute(
      json("PATCH", { enabled: false, projectId: ids.project }),
      context,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      errors: { code: "schedule_transition_invalid" },
      status: 409,
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("refuses an unauthorized create before any schedule write", async () => {
    mocks.scope.mockRejectedValue(new AuthorizationError("forbidden"));
    const response = await createRoute(
      json("POST", {
        frequency: "manual",
        jitterMinutes: 60,
        name: "Manual",
        projectId: ids.project,
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("maps an empty-only delete refusal to 409 and still deletes an empty schedule", async () => {
    mocks.delete.mockRejectedValueOnce(new CheckScheduleNotEmptyError());
    const refused = await deleteRoute(json("DELETE", { projectId: ids.project }), context);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      errors: { code: "check_schedule_not_empty" },
      status: 409,
    });
    const deleted = await deleteRoute(json("DELETE", { projectId: ids.project }), context);
    expect(deleted.status).toBe(200);
    expect(mocks.delete).toHaveBeenLastCalledWith("user_1", "project_1", ids.schedule);
    expect(mocks.scope.mock.calls.map((call) => call[1])).toEqual(["manage", "manage"]);
  });

  it("maps a plan capacity refusal to 403 and writes no schedule", async () => {
    mocks.create.mockRejectedValue(
      new CapacityLimitError({
        dimension: "scheduleFrequencies",
        limit: 1,
        requested: 1,
        scope: "project",
        used: 1,
      }),
    );
    const response = await createRoute(
      json("POST", {
        frequency: "manual",
        jitterMinutes: 60,
        name: "Manual",
        projectId: ids.project,
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "plan_limit_reached" });
    expect(mocks.scope).toHaveBeenCalledWith(actor, "update", ids.project, {
      type: "check_schedule",
    });
  });

  it("archives and restores at manage scope", async () => {
    mocks.rank.mockResolvedValue({ archivedAt: null, enabled: true });
    mocks.archive.mockResolvedValue({ changed: true, publicId: ids.schedule });
    mocks.restore.mockResolvedValue({ changed: true, publicId: ids.schedule });
    await archiveRoute(
      json("POST", { destinationScheduleId: null, projectId: ids.project }),
      context,
    );
    mocks.rank.mockResolvedValue({
      archivedAt: new Date("2026-01-01T00:00:00.000Z"),
      enabled: false,
    });
    await restoreRoute(json("POST", { projectId: ids.project }), context);
    expect(mocks.archive).toHaveBeenCalledWith("user_1", "project_1", {
      destinationScheduleId: null,
      projectId: ids.project,
      scheduleId: ids.schedule,
    });
    expect(mocks.restore).toHaveBeenCalledWith("user_1", "project_1", ids.schedule);
    expect(mocks.scope.mock.calls.map((call) => call[1])).toEqual(["manage", "manage"]);
  });

  it("assigns and removes keyword targets at update scope", async () => {
    mocks.assign.mockResolvedValue({ updated: 1 });
    mocks.remove.mockResolvedValue({ updated: 1 });
    const body = { keywordIds: [ids.keyword], projectId: ids.project };
    await assignRoute(json("POST", body), context);
    await removeRoute(json("DELETE", body), context);
    expect(mocks.assign).toHaveBeenCalledWith(
      "user_1",
      "project_1",
      expect.objectContaining({ ...body, scheduleId: ids.schedule }),
    );
    expect(mocks.remove).toHaveBeenCalledWith(
      "user_1",
      "project_1",
      expect.objectContaining({ ...body, scheduleId: ids.schedule }),
    );
  });
});

describe("local monitor pause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue(actor);
    mocks.pause.mockResolvedValue({ kind: "saved", replayed: false, receipt: { id: "monitor" } });
  });

  it("pauses through the session actor and does not write when authentication fails", async () => {
    const input = {
      idempotencyKey: "pause-1",
      monitorId: "lmn_a00000000000000000000000",
      projectId: ids.project,
    };
    await pauseRecurringMonitorAction(input);
    expect(mocks.pause).toHaveBeenCalledWith(input, { actor });
    mocks.pause.mockClear();
    mocks.actor.mockRejectedValue(new Error("unauthenticated"));
    await expect(pauseRecurringMonitorAction(input)).rejects.toThrow("unauthenticated");
    expect(mocks.pause).not.toHaveBeenCalled();
  });
});

vi.mock("@/lib/schedules/review-load", async () => ({
  loadScheduleSpend: (await import("@/lib/schedules/review-noop.test-fixture")).loadNoScheduleSpend,
}));
