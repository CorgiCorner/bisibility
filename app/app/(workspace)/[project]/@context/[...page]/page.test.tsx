import { KeywordHeaderContext } from "@/components/keywords/KeywordHeaderContext";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { HeaderContextSlot } from "@/components/shell/HeaderContextSlot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectHeaderContext from "./page";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  readable: vi.fn(),
  targetContext: vi.fn(),
  headerMarkets: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({
  resolveProjectAccess: mocks.access,
  requireReadableProject: mocks.readable,
}));
vi.mock("@/lib/queries/keyword-target-context", () => ({
  getKeywordTargetContext: mocks.targetContext,
}));
vi.mock("@/lib/queries/header-markets", () => ({ listHeaderMarkets: mocks.headerMarkets }));
vi.mock("@/lib/actions/keyword", () => ({ addKeywordsMatrix: vi.fn() }));
vi.mock("@/lib/actions/keyword-bulk", () => ({ bulkDeleteKeywords: vi.fn() }));

const keyword = { ...keywordRows[0], id: "kw_a00000000000000000000000" };
const projectId = "prj_a00000000000000000000000";
const readable = (role: string) => ({
  actor: { memberships: [{ projectId: "project_db", role }] },
  project: { id: "project_db" },
});
const route = (page: string[]) =>
  ProjectHeaderContext({ params: Promise.resolve({ page, project: projectId }) });

describe("project header context route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ publicId: projectId });
    mocks.readable.mockResolvedValue(readable("owner"));
    mocks.headerMarkets.mockResolvedValue([]);
    mocks.targetContext.mockResolvedValue({ projectMarkets: { markets: [] }, targets: [keyword] });
  });

  it("loads keyword context in the header slot on direct detail navigation", async () => {
    const element = await route(["rank-tracker", keyword.id]);
    expect(element?.type).toBe(KeywordHeaderContext);
    expect(element?.props).toMatchObject({
      keyword,
      projectId,
      targets: [keyword],
      canCreateKeyword: true,
      canUpdateKeyword: true,
    });
    expect(mocks.targetContext).toHaveBeenCalledWith(projectId, keyword.id);
    expect(mocks.headerMarkets).not.toHaveBeenCalled();
  });

  it("keeps selectors but disables management for a viewer", async () => {
    mocks.readable.mockResolvedValue(readable("viewer"));
    expect((await route(["rank-tracker", keyword.id]))?.props).toMatchObject({
      canCreateKeyword: false,
      canUpdateKeyword: false,
    });
  });

  it("does not show another keyword's context when the target is missing", async () => {
    mocks.targetContext.mockResolvedValue({ projectMarkets: { markets: [] }, targets: [] });
    expect(await route(["rank-tracker", keyword.id])).toBeNull();
  });

  it("keeps the standard market context on the rank tracker list", async () => {
    const result = await route(["rank-tracker"]);
    expect(result?.type).toBe(HeaderContextSlot);
    expect(result?.props).toEqual({ contexts: [], projectRef: projectId });
    expect(mocks.headerMarkets).toHaveBeenCalledWith(projectId);
    expect(mocks.targetContext).not.toHaveBeenCalled();
  });

  it.each(["markets", "settings", "integrations", "runs"])(
    "clears the parallel slot on %s without querying markets",
    async (section) => {
      expect(await route([section])).toBeNull();
      expect(mocks.headerMarkets).not.toHaveBeenCalled();
      expect(mocks.targetContext).not.toHaveBeenCalled();
    },
  );
  it("does not load keyword targets on unrelated pages", async () => {
    expect(await route(["runs", "schedules"])).toBeNull();
    expect(mocks.targetContext).not.toHaveBeenCalled();
  });
});
