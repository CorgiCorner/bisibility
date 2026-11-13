import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadProjectPagesScreen } from "./screen";
import type { ProjectPagesQuery } from "./url-state";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  list: vi.fn(),
  sources: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./queries", () => ({
  getProjectPageSources: mocks.sources,
  getProjectPagesList: mocks.list,
}));
vi.mock("./tag-queries", () => ({
  getProjectPageTagView: vi.fn(async () => ({
    keywordOnly: [],
    options: [],
    rows: [],
    sitemaps: [],
    tagCount: 0,
  })),
}));
vi.mock("./sync", () => ({ syncProjectPages: mocks.sync }));
vi.mock("./compare-read", () => ({ loadPagesCompare: mocks.compare }));
vi.mock("./snapshot-read", () => ({
  getActivePageSnapshot: vi.fn(async () => null),
  loadExistingVsNew: vi.fn(async () => null),
}));

const query: ProjectPagesQuery = {
  dir: "desc",
  page: 1,
  period: "28",
  search: "",
  sort: "clicks",
  span: "since",
  tab: "all",
};

const empty = { counts: { all: 0, listed: 0, notListed: 0 }, rows: [], total: 0 };
const filled = { counts: { all: 2, listed: 1, notListed: 1 }, rows: [{ path: "/docs" }], total: 2 };

describe("loadProjectPagesScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sources.mockResolvedValue([]);
    mocks.sync.mockResolvedValue({ status: "ok" });
  });

  it("syncs once when the registry is empty and the actor may write", async () => {
    mocks.list.mockResolvedValueOnce(empty).mockResolvedValueOnce(filled);
    const view = await loadProjectPagesScreen("prj_1", query, {
      now: new Date("2026-11-10T00:00:00.000Z"),
      syncIfEmpty: true,
    });
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(view.list).toEqual(filled);
  });

  it("leaves an empty registry alone when writing is not allowed", async () => {
    mocks.list.mockResolvedValue(empty);
    await loadProjectPagesScreen("prj_1", query, { syncIfEmpty: false });
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("does not sync a search that merely matches nothing", async () => {
    mocks.list.mockResolvedValueOnce({ ...empty, counts: { all: 0, listed: 0, notListed: 0 } });
    mocks.list.mockResolvedValueOnce(filled);
    await loadProjectPagesScreen("prj_1", { ...query, search: "missing" }, { syncIfEmpty: true });
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("loads Compare only on the Compare tab", async () => {
    mocks.list.mockResolvedValue(filled);
    mocks.compare.mockResolvedValue({ empty: "no_tags", result: null });
    await loadProjectPagesScreen("prj_1", query, { syncIfEmpty: false });
    expect(mocks.compare).not.toHaveBeenCalled();
    const view = await loadProjectPagesScreen(
      "prj_1",
      { ...query, annotation: "sig_note", changed: "tag_a", tab: "compare" },
      { syncIfEmpty: false },
    );
    expect(mocks.compare).toHaveBeenCalledWith("prj_1", {
      annotationId: "sig_note",
      changedTagId: "tag_a",
      metric: undefined,
      now: expect.any(Date),
      unchangedTagId: undefined,
    });
    expect(view.compare).toEqual({ empty: "no_tags", result: null });
  });
});
