import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listDemoBacklinksAction,
  listDemoDomainOverviewsAction,
  listDemoKeywordResearchAction,
  readDemoBacklinksAction,
  readDemoDomainOverviewAction,
  readDemoKeywordResearchAction,
} from "./demo-research";

const projectPublicId = "prj_abcdefghijklmnopqrstuvwx";
const mocks = vi.hoisted(() => ({
  actor: { id: "viewer_1" },
  backlinks: vi.fn(),
  domain: vi.fn(),
  editable: vi.fn(),
  keyword: vi.fn(),
  keywordList: vi.fn(),
  requireScope: vi.fn(),
}));

vi.mock("@/lib/backlinks/stored", () => ({
  findStoredBacklinks: vi.fn(),
  listStoredBacklinks: mocks.backlinks,
}));
vi.mock("@/lib/domain-overview/stored", () => ({
  findStoredDomainOverview: vi.fn(),
  listStoredDomainOverviews: mocks.domain,
}));
vi.mock("@/lib/keyword-research/stored-read", () => ({
  findStoredKeywordResearch: mocks.keyword,
  listStoredKeywordResearch: mocks.keywordList,
}));
vi.mock("@/lib/demo/research-storage", () => ({
  isEditableDemoResearchProject: mocks.editable,
}));
vi.mock("./_shared", () => ({
  getActionActor: vi.fn(async () => mocks.actor),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireScope,
}));

describe("demo research actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.editable.mockReturnValue(true);
    mocks.requireScope.mockResolvedValue({ id: "project_1", publicId: projectPublicId });
    mocks.keyword.mockResolvedValue({ ok: true });
    mocks.keywordList.mockResolvedValue([{ requestKey: "a".repeat(64) }]);
    mocks.backlinks.mockResolvedValue([]);
    mocks.domain.mockResolvedValue([]);
  });

  it("authorizes Viewer reads before accessing each stored module", async () => {
    await expect(listDemoKeywordResearchAction({ projectId: projectPublicId })).resolves.toEqual([
      { requestKey: "a".repeat(64) },
    ]);
    await expect(listDemoBacklinksAction({ projectId: projectPublicId })).resolves.toEqual([]);
    await expect(listDemoDomainOverviewsAction({ projectId: projectPublicId })).resolves.toEqual(
      [],
    );
    expect(mocks.requireScope).toHaveBeenCalledWith(mocks.actor, "read", projectPublicId, {
      type: "project",
    });
  });

  it("rejects cross-project reads before the stored lookup", async () => {
    mocks.requireScope.mockRejectedValue(new Error("Forbidden"));
    await expect(
      readDemoKeywordResearchAction({ projectId: projectPublicId, requestKey: "a".repeat(64) }),
    ).rejects.toThrow("Forbidden");
    expect(mocks.keyword).not.toHaveBeenCalled();
  });

  it("returns no data outside the configured editable project", async () => {
    mocks.editable.mockReturnValue(false);
    await expect(
      readDemoKeywordResearchAction({ projectId: projectPublicId, requestKey: "a".repeat(64) }),
    ).resolves.toBeNull();
    expect(mocks.keyword).not.toHaveBeenCalled();
  });

  it("rejects stored-list freshness fields on Backlinks and Domain Overview reads", async () => {
    await expect(
      readDemoBacklinksAction({
        freshUntil: "2026-10-10T00:00:00.000Z",
        includeSubdomains: true,
        mode: "as_is",
        projectId: projectPublicId,
        savedAt: "2026-09-10T00:00:00.000Z",
        stale: false,
        target: "saved.example",
        targetScope: "site",
      }),
    ).rejects.toThrow();
    await expect(
      readDemoDomainOverviewAction({
        freshUntil: "2026-10-10T00:00:00.000Z",
        languageCode: "en",
        locationCode: 2840,
        projectId: projectPublicId,
        savedAt: "2026-09-10T00:00:00.000Z",
        scope: "root",
        stale: true,
        target: "saved.example",
      }),
    ).rejects.toThrow();
  });
});
