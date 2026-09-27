import { beforeEach, expect, it, vi } from "vitest";
import { getRankCheckStatus, getRankCheckStatuses } from "./rank-check-status";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  run: vi.fn(),
  runs: vi.fn(),
  checks: vi.fn(),
}));
vi.mock("@/lib/actions/_shared", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/actions/_shared")>("@/lib/actions/_shared");
  return { ...actual, getActionActor: mocks.actor, requireProjectScope: mocks.scope };
});
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    rankCheckRun: { findFirst: mocks.run, findMany: mocks.runs },
    rankCheck: { findMany: mocks.checks },
  },
}));
const runId = "rcr_abcdefghijklmnopqrstuvwx";
const projectId = "prj_abcdefghijklmnopqrstuvwx";
const base = {
  publicId: runId,
  status: "queued",
  outcome: null,
  blockedReason: null,
  finishedAt: null,
  project: { publicId: projectId },
  items: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "actor_1" });
  mocks.scope.mockResolvedValue({ id: "project_1" });
  mocks.run.mockResolvedValue(base);
  mocks.runs.mockResolvedValue([base]);
  mocks.checks.mockResolvedValue([]);
});

it("polls a queued single run before any attempt exists", async () => {
  await expect(getRankCheckStatus({ rankCheckId: runId })).resolves.toMatchObject({
    status: "running",
    position: null,
  });
  expect(mocks.scope).toHaveBeenCalledWith(
    { id: "actor_1" },
    "read",
    projectId,
    { type: "project" },
    { allowReadOnly: true },
  );
  expect(mocks.run).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { publicId: runId, selectionKind: "single", deletedAt: null },
    }),
  );
});

it("returns the completed attempt, including its actual depth", async () => {
  mocks.run.mockResolvedValue({
    ...base,
    status: "completed",
    outcome: "succeeded",
    items: [
      {
        status: "completed",
        blockedReason: null,
        rankCheck: {
          status: "completed",
          errorCode: null,
          error: null,
          position: null,
          requestedDepth: 50,
          finishedAt: new Date("2026-09-26T23:35:00Z"),
        },
      },
    ],
  });
  await expect(getRankCheckStatus({ rankCheckId: runId })).resolves.toEqual({
    status: "completed",
    errorCode: null,
    error: null,
    position: null,
    requestedDepth: 50,
    finishedAt: "2026-09-26T23:35:00.000Z",
  });
});

it.each([
  ["completed", "failed", "failed"],
  ["completed", "deferred", "deferred"],
  ["cancelled", null, "deferred"],
  ["blocked", null, "failed"],
])("terminalizes a %s / %s run without an attempt", async (status, outcome, expected) => {
  mocks.run.mockResolvedValue({ ...base, status, outcome, blockedReason: "budget_exhausted" });
  await expect(getRankCheckStatus({ rankCheckId: runId })).resolves.toMatchObject({
    status: expected,
    errorCode: "budget_exhausted",
  });
});

it("does not reveal run results to another project's member", async () => {
  const { AuthorizationError } = await import("@/lib/auth/authorize");
  mocks.scope.mockRejectedValue(new AuthorizationError("forbidden"));
  await expect(getRankCheckStatus({ rankCheckId: runId })).rejects.toThrow("Rank check not found.");
});

it("supports queued run ids in the batch poll with the authorized project constraint", async () => {
  await expect(getRankCheckStatuses({ projectId, rankCheckIds: [runId] })).resolves.toMatchObject([
    { rankCheckId: runId, status: "running" },
  ]);
  expect(mocks.runs).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ projectId: "project_1" }) }),
  );
});
