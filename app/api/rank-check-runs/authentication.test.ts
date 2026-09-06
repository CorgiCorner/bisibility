import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  assign: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  getActionActor: vi.fn(),
  getSession: vi.fn(),
  launch: vi.fn(),
  preview: vi.fn(),
  remove: vi.fn(),
  requireScope: vi.fn(),
  setDefault: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.getSession,
  requireSession: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions/_shared")>();
  return {
    ...actual,
    getActionActor: mocks.getActionActor,
    requireProjectScope: mocks.requireScope,
  };
});
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getCheckSchedule: vi.fn(),
  getRankCheckRun: vi.fn(),
  getRankCheckRunCommand: vi.fn(),
  getRetryParentRun: vi.fn(),
  listCheckSchedules: vi.fn(),
  listRankCheckRunItems: vi.fn(),
  listRankCheckRuns: vi.fn(),
}));
vi.mock("@/lib/rank-check/runs/launch", () => ({
  launchRankCheckRun: mocks.launch,
  launchRetryRun: vi.fn(),
}));
vi.mock("@/lib/rank-check/runs/preview", () => ({ previewRankCheckRun: mocks.preview }));
vi.mock("@/lib/rank-check/runs/cancel-run", () => ({
  cancelRankCheckRunCommand: vi.fn(),
  skipRankCheckRunCommand: vi.fn(),
}));
vi.mock("@/lib/rank-check/runs/run-now", () => ({ runRankCheckRunNowCommand: vi.fn() }));
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

import {
  POST as assignKeywords,
  DELETE as removeKeywords,
} from "@/app/api/check-schedules/[publicId]/keywords/route";
import {
  DELETE as deleteSchedule,
  GET as getSchedule,
  PATCH,
} from "@/app/api/check-schedules/[publicId]/route";
import { POST as setDefault } from "@/app/api/check-schedules/[publicId]/set-default/route";
import { POST as createSchedule, GET as listSchedules } from "@/app/api/check-schedules/route";
import { ProjectNotFoundError } from "@/lib/actions/_shared";
import { ApiNotFoundError } from "@/lib/api/errors";
import { AuthorizationError } from "@/lib/auth/authorize";
import { ProjectDomainRequiredError } from "@/lib/projects/tracked-domain";
import { SampleProjectError } from "@/lib/rank-check/runs/launch-types";
import { POST as cancel } from "./[publicId]/cancel/route";
import { GET as items } from "./[publicId]/items/route";
import { POST as retry } from "./[publicId]/retry/route";
import { GET as getRun } from "./[publicId]/route";
import { POST as runNow } from "./[publicId]/run-now/route";
import { POST as skip } from "./[publicId]/skip/route";
import { POST as preview } from "./preview/route";
import { POST as launch, GET as listRuns } from "./route";

const projectId = "prj_a00000000000000000000000";
const runId = "rcr_a00000000000000000000000";
const scheduleId = "sch_a00000000000000000000000";
const keywordId = "kw_a00000000000000000000000";
const runContext = { params: Promise.resolve({ publicId: runId }) };
const scheduleContext = { params: Promise.resolve({ publicId: scheduleId }) };

function json(method: string, path: string, body: object) {
  return new Request(`https://example.com${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method,
  });
}

const cases = [
  [
    "runs list",
    () => listRuns(new Request(`https://example.com/api/rank-check-runs?project=${projectId}`)),
  ],
  [
    "runs launch",
    () =>
      launch(
        json("POST", "/api/rank-check-runs", {
          previewToken: "token",
          projectId,
          spec: { kind: "all", v: 1 },
        }),
      ),
  ],
  [
    "runs preview",
    () =>
      preview(
        json("POST", "/api/rank-check-runs/preview", { projectId, spec: { kind: "all", v: 1 } }),
      ),
  ],
  [
    "run get",
    () =>
      getRun(
        new Request(`https://example.com/api/rank-check-runs/${runId}?project=${projectId}`),
        runContext,
      ),
  ],
  [
    "run items",
    () =>
      items(
        new Request(`https://example.com/api/rank-check-runs/${runId}/items?project=${projectId}`),
        runContext,
      ),
  ],
  [
    "run cancel",
    () => cancel(json("POST", `/api/rank-check-runs/${runId}/cancel`, { projectId }), runContext),
  ],
  [
    "run retry",
    () =>
      retry(
        json("POST", `/api/rank-check-runs/${runId}/retry`, {
          projectId,
          relation: "retry_failed",
        }),
        runContext,
      ),
  ],
  [
    "run now",
    () => runNow(json("POST", `/api/rank-check-runs/${runId}/run-now`, { projectId }), runContext),
  ],
  [
    "run skip",
    () => skip(json("POST", `/api/rank-check-runs/${runId}/skip`, { projectId }), runContext),
  ],
  [
    "schedules list",
    () =>
      listSchedules(new Request(`https://example.com/api/check-schedules?project=${projectId}`)),
  ],
  [
    "schedule create",
    () =>
      createSchedule(
        json("POST", "/api/check-schedules", { frequency: "manual", name: "Manual", projectId }),
      ),
  ],
  [
    "schedule get",
    () =>
      getSchedule(
        new Request(`https://example.com/api/check-schedules/${scheduleId}?project=${projectId}`),
        scheduleContext,
      ),
  ],
  [
    "schedule update",
    () =>
      PATCH(
        json("PATCH", `/api/check-schedules/${scheduleId}`, { name: "Updated", projectId }),
        scheduleContext,
      ),
  ],
  [
    "schedule delete",
    () =>
      deleteSchedule(
        json("DELETE", `/api/check-schedules/${scheduleId}`, { projectId }),
        scheduleContext,
      ),
  ],
  [
    "schedule default",
    () =>
      setDefault(
        json("POST", `/api/check-schedules/${scheduleId}/set-default`, { projectId }),
        scheduleContext,
      ),
  ],
  [
    "schedule assign",
    () =>
      assignKeywords(
        json("POST", `/api/check-schedules/${scheduleId}/keywords`, {
          keywordIds: [keywordId],
          projectId,
        }),
        scheduleContext,
      ),
  ],
  [
    "schedule remove",
    () =>
      removeKeywords(
        json("DELETE", `/api/check-schedules/${scheduleId}/keywords`, {
          keywordIds: [keywordId],
          projectId,
        }),
        scheduleContext,
      ),
  ],
] as const;

const scheduleNotFoundCases = [
  {
    invoke: () =>
      PATCH(json("PATCH", `/api/check-schedules/${scheduleId}`, { projectId }), scheduleContext),
    name: "PATCH",
    service: mocks.update,
  },
  {
    invoke: () =>
      deleteSchedule(
        json("DELETE", `/api/check-schedules/${scheduleId}`, { projectId }),
        scheduleContext,
      ),
    name: "DELETE",
    service: mocks.delete,
  },
  {
    invoke: () =>
      setDefault(
        json("POST", `/api/check-schedules/${scheduleId}/set-default`, { projectId }),
        scheduleContext,
      ),
    name: "set-default",
    service: mocks.setDefault,
  },
  {
    invoke: () =>
      assignKeywords(
        json("POST", `/api/check-schedules/${scheduleId}/keywords`, {
          keywordIds: [keywordId],
          projectId,
        }),
        scheduleContext,
      ),
    name: "keyword assignment",
    service: mocks.assign,
  },
  {
    invoke: () =>
      removeKeywords(
        json("DELETE", `/api/check-schedules/${scheduleId}/keywords`, {
          keywordIds: [keywordId],
          projectId,
        }),
        scheduleContext,
      ),
    name: "keyword removal",
    service: mocks.remove,
  },
] as const;

describe("app rank run and schedule route boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.getActionActor.mockResolvedValue(mocks.actor);
    mocks.requireScope.mockResolvedValue({ id: "project_1", publicId: projectId });
  });

  it.each(cases)("returns 401 with no-store for anonymous %s", async (_name, invoke) => {
    mocks.getSession.mockResolvedValue(null);
    const response = await invoke();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getActionActor).not.toHaveBeenCalled();
  });

  it.each(cases)("returns 403 with no-store for non-member %s", async (_name, invoke) => {
    mocks.requireScope.mockRejectedValue(new AuthorizationError("forbidden"));
    const response = await invoke();
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(cases)("returns 404 with no-store for unknown-project %s", async (_name, invoke) => {
    mocks.requireScope.mockRejectedValue(new ProjectNotFoundError());
    const response = await invoke();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(scheduleNotFoundCases)(
    "returns 404 for an unknown schedule on $name",
    async ({ invoke, service }) => {
      service.mockRejectedValueOnce(new ApiNotFoundError("Check schedule not found."));

      const response = await invoke();

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        type: "https://bisibility.com/problems/not_found",
      });
    },
  );

  it("maps a launch domain guard to a problem response", async () => {
    mocks.requireScope.mockResolvedValueOnce({
      domain: null,
      id: "project_1",
      isSample: false,
      publicId: projectId,
    });
    mocks.launch.mockRejectedValueOnce(new ProjectDomainRequiredError());

    const response = await launch(
      json("POST", "/api/rank-check-runs", {
        previewToken: "token",
        projectId,
        spec: { kind: "all", v: 1 },
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      status: 422,
      type: "https://bisibility.com/problems/project_domain_required",
    });
  });

  it("maps a preview sample guard to a problem response", async () => {
    mocks.requireScope.mockResolvedValueOnce({
      domain: "example.com",
      id: "project_1",
      isSample: true,
      publicId: projectId,
    });
    mocks.preview.mockRejectedValueOnce(new SampleProjectError());

    const response = await preview(
      json("POST", "/api/rank-check-runs/preview", { projectId, spec: { kind: "all", v: 1 } }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      status: 403,
      type: "https://bisibility.com/problems/sample_project",
    });
  });
});
