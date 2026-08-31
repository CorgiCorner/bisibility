import { DRAWER_LIST_CAP } from "@/lib/search-insights/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSearchInsightsBandList,
  loadSearchInsightsOverlapList,
  loadSearchInsightsPageDetail,
  loadSearchInsightsQueryDetail,
} from "./search-insights-drawers";

const mocks = vi.hoisted(() => ({
  band: vi.fn(),
  overlap: vi.fn(),
  page: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/search-insights/queries/band-list", () => ({
  loadPositionBandQueries: mocks.band,
}));
vi.mock("@/lib/search-insights/queries/overlap-list", () => ({
  loadOverlapQueries: mocks.overlap,
}));
vi.mock("@/lib/search-insights/queries/page-detail", () => ({ loadPageDetail: mocks.page }));
vi.mock("@/lib/search-insights/queries/query-detail", () => ({ loadQueryDetail: mocks.query }));
vi.mock("./_shared", () => ({
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
}));

describe("search insights drawer reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of Object.values(mocks)) mock.mockResolvedValue({ rows: [], total: 0 });
  });

  it("hands the project reference and the window to each read service", async () => {
    await loadSearchInsightsQueryDetail({
      period: "90",
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
      query: "stored query",
    });
    await loadSearchInsightsPageDetail({
      page: "https://example.com/guide",
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
    });
    await loadSearchInsightsBandList({
      limit: 15,
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
    });
    await loadSearchInsightsOverlapList({
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
    });

    expect(mocks.query).toHaveBeenCalledWith("prj_1", {
      period: "90",
      property: "sc-domain:archived.example.com",
      query: "stored query",
    });
    expect(mocks.page).toHaveBeenCalledWith("prj_1", {
      page: "https://example.com/guide",
      period: undefined,
      property: "sc-domain:archived.example.com",
    });
    expect(mocks.band).toHaveBeenCalledWith("prj_1", {
      limit: 15,
      period: undefined,
      property: "sc-domain:archived.example.com",
    });
    expect(mocks.overlap).toHaveBeenCalledWith("prj_1", {
      limit: undefined,
      period: undefined,
      property: "sc-domain:archived.example.com",
    });
  });

  it("refuses a list bigger than one click is allowed to materialize", async () => {
    await expect(
      loadSearchInsightsBandList({
        limit: DRAWER_LIST_CAP + 1,
        projectId: "prj_1",
        property: "sc-domain:example.com",
      }),
    ).rejects.toThrow();
    expect(mocks.band).not.toHaveBeenCalled();
  });

  it("refuses a request with no project reference", async () => {
    await expect(loadSearchInsightsQueryDetail({ query: "stored query" })).rejects.toThrow();
    await expect(loadSearchInsightsPageDetail({ projectId: "prj_1", page: "" })).rejects.toThrow();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.page).not.toHaveBeenCalled();
  });
});
