import { beforeEach, expect, it, vi } from "vitest";
import { ApiAuthError } from "./auth";
import { ApiNotFoundError } from "./errors";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  readRun: vi.fn(),
  readRuns: vi.fn(),
  session: vi.fn(),
  project: vi.fn(),
  keyword: vi.fn(),
}));
vi.mock("./router", async (importOriginal) =>
  (await import("./response-capture.test-support")).captureRouter(await importOriginal()),
);
vi.mock("@/lib/api/auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  authenticateBearer: mocks.authenticate,
}));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: vi.fn(async () => ({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { project: { findUnique: mocks.project }, keyword: { findFirst: mocks.keyword } },
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: mocks.session,
  requireRole: mocks.session,
  getSession: mocks.session,
}));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getRankCheckRun: mocks.readRun,
  listRankCheckRuns: mocks.readRuns,
}));

import { handleApiRequest } from "./router";

const projectRef = "prj_aaaaaaaaaaaaaaaaaaaaaaaa";
const foreignRef = "prj_bbbbbbbbbbbbbbbbbbbbbbbb";
const runRef = "rcr_aaaaaaaaaaaaaaaaaaaaaaaa";
const project = {
  id: "project-db",
  publicId: projectRef,
  domain: "example.test",
  name: "Example",
  ownerId: "owner",
  writeMode: "active",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};
function run(status: string, outcome: string | null) {
  return {
    id: runRef,
    status,
    outcome,
    trigger: "manual",
    counts: {
      requested: 1,
      total: 1,
      completed: 0,
      failed: 0,
      deferred: outcome === "deferred" ? 1 : 0,
      skipped: 0,
      cancelled: status === "cancelled" ? 1 : 0,
      internalOnly: "omit",
    },
    keywordCount: 1,
    targetCount: 1,
    plannedFor: null,
    launchedAt: null,
    startedAt: null,
    finishedAt:
      status === "cancelled" || status === "completed" ? "2026-10-12T10:00:00.000Z" : null,
    blockedReason: status === "blocked" ? "budget_exhausted" : null,
    parentRunId: null,
    costCents: null,
    usage: { actual: null, estimated: null, unit: "operations", internalOnly: "omit" },
    nativeEstimate: { providerId: null, unit: null, quantity: null, unknownTargets: 1 },
    selectionSpec: { internalOnly: "omit" },
    requestedBy: { name: "Private actor" },
    orchestrationWorkflowId: "omit",
  };
}
function request(path: string, method = "GET") {
  return handleApiRequest(
    new Request(`https://example.test/api/v1/${path}`, {
      method,
      headers: { authorization: "Bearer bsb_pat_live_fixture" },
    }),
    path.split("?")[0].split("/"),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({
    kind: "personal_token",
    memberships: [{ projectId: project.id, role: "viewer" }],
    token: {
      id: "pat",
      name: "Fixture",
      prefix: "bsb_pat_live_fixture",
      scopes: ["read", "write"],
      userId: "viewer",
    },
    user: { id: "viewer" },
  });
  mocks.project.mockImplementation(async ({ where }) =>
    where.publicId === projectRef || where.id === project.id ? project : null,
  );
  mocks.readRun.mockResolvedValue(run("cancelled", null));
  mocks.readRuns.mockResolvedValue({ data: [run("cancelled", null)], nextCursor: null });
});
it.each([
  ["cancelled", null, true, "terminal"],
  ["completed", "deferred", true, "terminal"],
  ["blocked", null, false, "blocked"],
  ["future_status", null, false, "unknown"],
])("reads %s without requiring a completed check", async (status, outcome, terminal, polling) => {
  mocks.readRun.mockResolvedValue(run(String(status), outcome === null ? null : String(outcome)));
  const response = await request(`projects/${projectRef}/rank-check-runs/${runRef}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    id: runRef,
    status,
    outcome,
    terminal,
    polling_state: polling,
    cost_cents: null,
    native_estimate: { quantity: null },
    counts_basis: "planned_or_unlaunched",
  });
  expect(mocks.readRun).toHaveBeenCalledWith(project.id, runRef);
  expect(mocks.keyword).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
});
it("keeps list scope bounded to the authorized project and includes unlaunched outcomes", async () => {
  const response = await request(`projects/${projectRef}/rank-check-runs?limit=25`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    data: [{ id: runRef, status: "cancelled" }],
    meta: { next_cursor: null },
  });
  expect(JSON.stringify(body)).not.toContain("omit");
  expect(JSON.stringify(body)).not.toContain("Private actor");
  expect(mocks.readRuns).toHaveBeenCalledWith(project.id, expect.any(URL), {
    includeUnlaunched: true,
  });
});
it("refuses a foreign project and foreign run without exposing their state", async () => {
  expect((await request(`projects/${foreignRef}/rank-check-runs/${runRef}`)).status).toBe(404);
  expect(mocks.readRun).not.toHaveBeenCalled();
  mocks.readRun.mockRejectedValue(new ApiNotFoundError("Rank-check run not found."));
  expect(
    (await request(`projects/${projectRef}/rank-check-runs/rcr_bbbbbbbbbbbbbbbbbbbbbbbb`)).status,
  ).toBe(404);
  expect(mocks.readRun).toHaveBeenCalledWith(project.id, "rcr_bbbbbbbbbbbbbbbbbbbbbbbb");
});
it("renews bearer authentication on each read and never gives a viewer launch rights", async () => {
  expect((await request(`projects/${projectRef}/rank-check-runs/${runRef}`)).status).toBe(200);
  mocks.authenticate.mockRejectedValueOnce(new ApiAuthError());
  expect((await request(`projects/${projectRef}/rank-check-runs/${runRef}`)).status).toBe(401);
  expect(mocks.readRun).toHaveBeenCalledTimes(1);
  expect((await request("keywords/kw_aaaaaaaaaaaaaaaaaaaaaaaa/checks", "POST")).status).toBe(403);
  expect(mocks.keyword).not.toHaveBeenCalled();
});
