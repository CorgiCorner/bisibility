import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  scope: vi.fn(),
  run: vi.fn(),
  samples: vi.fn(),
  summaries: vi.fn(),
  project: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({ getActionActor: mocks.actor }));
vi.mock("@/lib/api/ai-tracking-service", () => ({ trackingScope: mocks.scope }));
vi.mock("@/lib/ai-tracking/queries/samples", () => ({ listTrackingSamples: mocks.samples }));
vi.mock("./ai-run-summary", () => ({ aiRunSummaries: mocks.summaries }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { aiTrackingRun: { findFirst: mocks.run }, project: { findUnique: mocks.project } },
}));

import { loadAiRunResults } from "./ai-run-results";

const runId = "air_abcdefghijklmnopqrstuvwx";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({ id: "viewer" });
  mocks.scope.mockResolvedValue({ id: "allowed", publicId: "prj_abcdefghijklmnopqrstuvwx" });
  mocks.project.mockResolvedValue({ name: "Example" });
  mocks.samples.mockResolvedValue({ items: [], nextCursor: null });
  mocks.summaries.mockResolvedValue([]);
});
it("requires the existing project permission before reading an AI result", async () => {
  mocks.scope.mockRejectedValueOnce(new Error("forbidden"));
  await expect(loadAiRunResults("prj_private", runId)).rejects.toThrow("forbidden");
  expect(mocks.run).not.toHaveBeenCalled();
});
it("does not fall back to a run from another project", async () => {
  mocks.run.mockResolvedValueOnce(null);
  expect(await loadAiRunResults("project", runId)).toBeNull();
  expect(mocks.run).toHaveBeenCalledWith(
    expect.objectContaining({ where: { projectId: "allowed", publicId: runId } }),
  );
  expect(mocks.samples).not.toHaveBeenCalled();
});
it("reads a bounded page for the exact selected run without launching work", async () => {
  const at = new Date("2026-10-21T10:00:00Z");
  mocks.run.mockResolvedValueOnce({
    id: "internal",
    publicId: runId,
    state: "completed",
    createdAt: at,
    plannedAt: null,
    finishedAt: at,
    launchPayload: {},
  });
  const result = await loadAiRunResults("project", runId, "next");
  expect(result?.run.id).toBe(runId);
  expect(mocks.samples).toHaveBeenCalledWith("allowed", "internal", { limit: 20, cursor: "next" });
});
