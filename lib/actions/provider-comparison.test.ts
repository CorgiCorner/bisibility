import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  launchProviderComparisonAction,
  loadProviderComparisonAction,
  previewProviderComparisonAction,
  readProviderComparisonAction,
} from "./provider-comparison";

const mocks = vi.hoisted(() => ({
  actor: { id: "actor" },
  project: vi.fn(),
  keyword: vi.fn(),
  context: vi.fn(),
  latest: vi.fn(),
  preview: vi.fn(),
  launch: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./_shared", () => ({
  getActionActor: async () => mocks.actor,
  requireProjectScope: mocks.project,
  requireKeywordScope: mocks.keyword,
}));
vi.mock("@/lib/provider-comparison/source", () => ({ loadComparisonContext: mocks.context }));
vi.mock("@/lib/provider-comparison/service", () => ({
  ComparisonPreviewRejectedError: class extends Error {},
  previewProviderComparison: mocks.preview,
  launchProviderComparison: mocks.launch,
  readProviderComparison: mocks.read,
  readLatestProviderComparison: mocks.latest,
}));
const scope = {
  projectRef: "prj_a23456789012345678901234",
  keywordRef: "kw_a23456789012345678901234",
};
const uuid = "e2baa90d-e1dd-4c7e-af23-05a0b89f8770";
const run = { id: uuid, keyword: { id: "keyword", text: "plumber" }, sides: [] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.project.mockResolvedValue({ id: "project" });
  mocks.keyword.mockResolvedValue({ id: "keyword", projectId: "project" });
  mocks.context.mockResolvedValue({ keyword: { id: "keyword" }, available: false, providers: [] });
  mocks.latest.mockResolvedValue(null);
  mocks.launch.mockResolvedValue(run);
  mocks.read.mockResolvedValue(run);
});
describe("provider comparison action authorization", () => {
  it("reads one-provider context without launching or quoting", async () => {
    expect(await loadProviderComparisonAction(scope)).toMatchObject({
      ok: true,
      context: { available: false, keyword: { id: scope.keywordRef } },
    });
    expect(mocks.context).toHaveBeenCalledWith("project", "keyword");
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.project).toHaveBeenCalledWith(mocks.actor, "read", scope.projectRef, {
      type: "keyword",
    });
  });
  it("blocks cross-project keywords before every service call", async () => {
    mocks.keyword.mockResolvedValue({ id: "foreign", projectId: "other" });
    expect(await previewProviderComparisonAction(scope)).toEqual({ ok: false });
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("does not let a viewer preview or launch", async () => {
    mocks.project.mockRejectedValue(new Error("Forbidden"));
    expect(await previewProviderComparisonAction(scope)).toEqual({ ok: false });
    expect(
      await launchProviderComparisonAction({
        ...scope,
        previewId: uuid,
        previewHash: "a".repeat(64),
        requestKey: uuid,
      }),
    ).toEqual({ ok: false, reason: "unconfirmed" });
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it("rejects caller actor IDs and internal identifiers", async () => {
    expect(await previewProviderComparisonAction({ ...scope, actorId: "other" })).toEqual({
      ok: false,
    });
    expect(await loadProviderComparisonAction({ ...scope, keywordRef: "keyword" })).toEqual({
      ok: false,
    });
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.project).not.toHaveBeenCalled();
  });
  it("binds launch to authorized internal keyword, project and actor and preserves retry key", async () => {
    const input = { ...scope, previewId: uuid, previewHash: "a".repeat(64), requestKey: uuid };
    expect(await launchProviderComparisonAction(input)).toMatchObject({
      ok: true,
      run: { keyword: { id: scope.keywordRef } },
    });
    expect(mocks.launch).toHaveBeenCalledWith({
      projectId: "project",
      keywordId: "keyword",
      actorId: "actor",
      previewId: uuid,
      previewHash: "a".repeat(64),
      requestKey: uuid,
    });
  });
  it("refuses another keyword result and redacts internal service errors", async () => {
    mocks.read.mockResolvedValue({ ...run, keyword: { id: "foreign" } });
    expect(await readProviderComparisonAction({ ...scope, runId: uuid })).toEqual({ ok: false });
    mocks.context.mockRejectedValue(new Error("Internal provider context lookup failed"));
    expect(await loadProviderComparisonAction(scope)).toEqual({ ok: false });
  });
});
