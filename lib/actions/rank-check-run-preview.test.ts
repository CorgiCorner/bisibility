import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewRankCheckRunAction } from "./rank-check-run-preview";

const PROJECT_ID = "prj_abcdefghijklmnopqrstuvwx";
const KEYWORD_ID = "kw_abcdefghijklmnopqrstuvwx";
const actor = { id: "user_1" };
const project = {
  domain: "example.com",
  id: "project_1",
  isSample: false,
  ownerId: "user_1",
  publicId: PROJECT_ID,
};

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  preview: vi.fn(),
  requireProjectScope: vi.fn(),
}));

vi.mock("./_shared", () => ({
  getActionActor: mocks.getActor,
  parseActionInput: (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
    schema.parse(value),
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/rank-check/runs/preview", () => ({ previewRankCheckRun: mocks.preview }));

describe("previewRankCheckRunAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActor.mockResolvedValue(actor);
    mocks.requireProjectScope.mockResolvedValue(project);
    mocks.preview.mockResolvedValue({ previewToken: "signed" });
  });

  it("requires writable project update scope", async () => {
    const input = {
      depth: 50,
      projectId: PROJECT_ID,
      providerId: "provider-a",
      spec: { kind: "single", keywordId: KEYWORD_ID, v: 1 },
    };

    await expect(previewRankCheckRunAction(input)).resolves.toEqual({ previewToken: "signed" });
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(actor, "update", PROJECT_ID, {
      type: "keyword",
    });
    expect(mocks.preview).toHaveBeenCalledWith({
      depth: 50,
      project,
      providerId: "provider-a",
      spec: input.spec,
    });
  });

  it("does not resolve or preview before authorization succeeds", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("forbidden"));

    await expect(
      previewRankCheckRunAction({
        projectId: PROJECT_ID,
        spec: { kind: "all", v: 1 },
      }),
    ).rejects.toThrow("forbidden");
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("rejects server input outside the client selection vocabulary", async () => {
    await expect(
      previewRankCheckRunAction({
        projectId: PROJECT_ID,
        spec: { kind: "scheduled_due", v: 1 },
      }),
    ).rejects.toThrow();
    expect(mocks.getActor).not.toHaveBeenCalled();
  });
});
