import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  cancel: vi.fn(),
  getRun: vi.fn(),
  getRunCommand: vi.fn(),
  getRetryParent: vi.fn(),
  launch: vi.fn(),
  listItems: vi.fn(),
  listRuns: vi.fn(),
  preview: vi.fn(),
  requireScope: vi.fn(),
  retry: vi.fn(),
  runNow: vi.fn(),
  skip: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/app-route", () => ({
  withAppRoute:
    (handler: (request: Request, actor: typeof mocks.actor, context?: unknown) => unknown) =>
    (request: Request, context?: unknown) =>
      handler(request, mocks.actor, context),
}));
vi.mock("@/lib/actions/_shared", () => ({ requireProjectScope: mocks.requireScope }));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getRankCheckRun: mocks.getRun,
  getRankCheckRunCommand: mocks.getRunCommand,
  getRetryParentRun: mocks.getRetryParent,
  listRankCheckRunItems: mocks.listItems,
  listRankCheckRuns: mocks.listRuns,
}));
vi.mock("@/lib/rank-check/runs/launch", () => ({
  launchRankCheckRun: mocks.launch,
  launchRetryRun: mocks.retry,
}));
vi.mock("@/lib/rank-check/runs/preview", () => ({ previewRankCheckRun: mocks.preview }));
vi.mock("@/lib/rank-check/runs/cancel-run", () => ({
  cancelRankCheckRunCommand: mocks.cancel,
  skipRankCheckRunCommand: mocks.skip,
}));
vi.mock("@/lib/rank-check/runs/run-now", () => ({
  runRankCheckRunNowCommand: mocks.runNow,
}));

import { POST as cancel } from "./[publicId]/cancel/route";
import { GET as items } from "./[publicId]/items/route";
import { POST as retry } from "./[publicId]/retry/route";
import { POST as runNow } from "./[publicId]/run-now/route";
import { POST as skip } from "./[publicId]/skip/route";
import { POST as preview } from "./preview/route";
import { POST as launch, GET as list } from "./route";

const projectId = "prj_a00000000000000000000000";
const publicId = "rcr_a00000000000000000000000";
const context = { params: Promise.resolve({ publicId }) };

function json(path: string, body: object, headers?: HeadersInit) {
  return new Request(`https://example.com${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
    method: "POST",
  });
}

describe("rank-check run app routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireScope.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      publicId: projectId,
    });
    mocks.getRun.mockResolvedValue({ id: publicId, status: "queued" });
    mocks.getRunCommand.mockResolvedValue({
      id: "run_1",
      orchestrationWorkflowId: `rank-check-run-${publicId}`,
      publicId,
      status: "planned",
    });
    mocks.getRetryParent.mockResolvedValue({ id: "run_1", items: [], publicId });
    mocks.listRuns.mockResolvedValue({ data: [{ id: publicId }], nextCursor: "next" });
    mocks.listItems.mockResolvedValue({ data: [{ id: "item_1" }], nextCursor: null });
    mocks.launch.mockResolvedValue({ publicId });
    mocks.retry.mockResolvedValue({ publicId });
    mocks.preview.mockResolvedValue({ previewToken: "signed" });
  });

  it("lists reads with read scope and list metadata", async () => {
    const response = await list(
      new Request(`https://example.com/api/rank-check-runs?project=${projectId}&limit=2`),
    );

    expect(mocks.requireScope).toHaveBeenCalledWith(
      mocks.actor,
      "read",
      projectId,
      { type: "keyword" },
      { allowReadOnly: true },
    );
    await expect(response.json()).resolves.toEqual({
      data: [{ id: publicId }],
      meta: { next_cursor: "next" },
    });
  });

  it("uses the Idempotency-Key header when the launch body omits it", async () => {
    await launch(
      json(
        "/api/rank-check-runs",
        { previewToken: "signed", projectId, spec: { kind: "all", v: 1 } },
        { "Idempotency-Key": "request-0001" },
      ),
    );

    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "request-0001", trigger: "api" }),
    );
  });

  it("returns a successful no-op response when launch admits no items", async () => {
    mocks.launch.mockResolvedValueOnce({
      message: "All selected keywords already have rank checks in progress.",
      outcome: "nothing_to_run",
      reason: "already_in_progress",
    });

    const response = await launch(
      json("/api/rank-check-runs", {
        previewToken: "signed",
        projectId,
        spec: { kind: "all", v: 1 },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        message: "All selected keywords already have rank checks in progress.",
        outcome: "nothing_to_run",
        reason: "already_in_progress",
      },
    });
    expect(mocks.getRun).not.toHaveBeenCalled();
  });

  it("returns a successful no-op response when retry admits no items", async () => {
    mocks.retry.mockResolvedValueOnce({
      message: "All selected keywords already have rank checks in progress.",
      outcome: "nothing_to_run",
      reason: "already_in_progress",
    });

    const response = await retry(
      json(`/api/rank-check-runs/${publicId}/retry`, {
        projectId,
        relation: "retry_failed",
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        message: "All selected keywords already have rank checks in progress.",
        outcome: "nothing_to_run",
        reason: "already_in_progress",
      },
    });
    expect(mocks.getRun).not.toHaveBeenCalled();
  });

  it("uses the shared preview library at update scope", async () => {
    await preview(json("/api/rank-check-runs/preview", { projectId, spec: { kind: "all", v: 1 } }));

    expect(mocks.requireScope).toHaveBeenCalledWith(mocks.actor, "update", projectId, {
      type: "keyword",
    });
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({ project: expect.objectContaining({ id: "project_1" }) }),
    );
  });

  it("returns a run DTO after cancellation even when Temporal handling was best effort", async () => {
    mocks.cancel.mockResolvedValue(undefined);
    const response = await cancel(
      json(`/api/rank-check-runs/${publicId}/cancel`, { projectId }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.cancel).toHaveBeenCalledWith({
      actorId: "user_1",
      projectId: "project_1",
      publicId,
    });
    await expect(response.json()).resolves.toEqual({ data: { id: publicId, status: "queued" } });
  });

  it("routes retry, run-now, skip, and item reads through their library functions", async () => {
    await retry(
      json(`/api/rank-check-runs/${publicId}/retry`, { projectId, relation: "retry_failed" }),
      context,
    );
    await runNow(json(`/api/rank-check-runs/${publicId}/run-now`, { projectId }), context);
    await skip(json(`/api/rank-check-runs/${publicId}/skip`, { projectId }), context);
    await items(
      new Request(`https://example.com/api/rank-check-runs/${publicId}/items?project=${projectId}`),
      context,
    );

    expect(mocks.retry).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "user_1", relation: "retry_failed" }),
    );
    expect(mocks.runNow).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_1" }));
    expect(mocks.skip).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_1" }));
    expect(mocks.listItems).toHaveBeenCalledWith("project_1", publicId, expect.any(URL));
  });
});
