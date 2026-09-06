import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "prj_abcdefghijklmnopqrstuvwx";
const KEYWORD_ID = "kw_abcdefghijklmnopqrstuvwx";
const project = {
  domain: "example.com",
  id: "project_1",
  isSample: false,
  publicId: PROJECT_ID,
};
const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  launch: vi.fn(),
  requireProjectScope: vi.fn(),
}));

vi.mock("./_shared", () => ({
  getActionActor: mocks.getActor,
  parseActionInput: (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/rank-check/runs/launch", () => ({ launchRankCheckRun: mocks.launch }));

import { LaunchRankCheckRunError, SampleProjectError } from "@/lib/rank-check/runs/launch-types";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { launchRankCheckRunAction } from "./rank-check-run-launch";

const input = {
  idempotencyKey: "request-0001",
  previewToken: "signed-token",
  projectId: PROJECT_ID,
  spec: { kind: "single" as const, keywordId: KEYWORD_ID, v: 1 as const },
};

describe("launchRankCheckRunAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue(project);
    mocks.launch.mockResolvedValue({
      estimatedCostCents: 25,
      keywordCount: 1,
      publicId: "rcr_abcdefghijklmnopqrstuvwx",
      status: "queued",
      targetCount: 1,
    });
  });

  it("authorizes and launches a manual run", async () => {
    await expect(launchRankCheckRunAction(input)).resolves.toMatchObject({ status: "queued" });

    expect(mocks.requireProjectScope).toHaveBeenCalledWith({ id: "user_1" }, "update", PROJECT_ID, {
      type: "keyword",
    });
    expect(mocks.launch).toHaveBeenCalledWith({
      actorId: "user_1",
      depth: undefined,
      idempotencyKey: "request-0001",
      previewToken: "signed-token",
      project,
      providerId: undefined,
      spec: input.spec,
      trigger: "manual",
    });
  });

  it.each([
    [new PreviewTokenError("expired"), "preview_expired"],
    [new PreviewTokenError("mismatch"), "preview_mismatch"],
    [new PreviewTokenError("tampered"), "preview_mismatch"],
    [new LaunchRankCheckRunError("budget_exhausted"), "budget_exhausted"],
    [new LaunchRankCheckRunError("no_provider"), "no_provider"],
  ])("returns typed launch failures", async (error, code) => {
    mocks.launch.mockRejectedValueOnce(error);

    await expect(launchRankCheckRunAction(input)).resolves.toMatchObject({
      code,
      status: "not_started",
    });
  });

  it("passes through the successful no-op launch outcome", async () => {
    mocks.launch.mockResolvedValueOnce({
      message: "All selected keywords already have rank checks in progress.",
      outcome: "nothing_to_run",
      reason: "already_in_progress",
    });

    const result = await launchRankCheckRunAction(input);

    expect(result).toEqual({
      message: "All selected keywords already have rank checks in progress.",
      outcome: "nothing_to_run",
      reason: "already_in_progress",
    });
    expect(result).not.toHaveProperty("status", "not_started");
  });

  it("short-circuits sample projects after domain validation", async () => {
    mocks.requireProjectScope.mockResolvedValueOnce({ ...project, isSample: true });
    mocks.launch.mockRejectedValueOnce(new SampleProjectError());

    await expect(launchRankCheckRunAction(input)).resolves.toEqual({
      code: "sample_project",
      message: "Sample projects don't run real checks.",
      status: "not_started",
    });
    expect(mocks.launch).toHaveBeenCalledOnce();
  });

  it("rejects an undersized idempotency key before authentication", async () => {
    await expect(launchRankCheckRunAction({ ...input, idempotencyKey: "short" })).rejects.toThrow();
    expect(mocks.getActor).not.toHaveBeenCalled();
  });
});
