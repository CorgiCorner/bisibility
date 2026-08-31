import { ROWS_PAGE_LIMIT, SEARCH_INSIGHTS_ROWS_CAP } from "@/lib/search-insights/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSearchInsightsRows } from "./search-insights-rows";

const mocks = vi.hoisted(() => ({ rowsPage: vi.fn() }));

vi.mock("@/lib/search-insights/queries/first-view", () => ({
  getSearchInsightsRowsPage: mocks.rowsPage,
}));
vi.mock("./_shared", () => ({
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
}));

const page = { kind: "queries", rows: [], total: 1_284, trackedTexts: [] };

describe("loadSearchInsightsRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rowsPage.mockResolvedValue(page);
  });

  it("hands the project reference and the window to the read service", async () => {
    await expect(
      loadSearchInsightsRows({
        kind: "queries",
        limit: 1_000,
        offset: 50,
        period: "90",
        projectId: "prj_1",
        property: "sc-domain:archived.example.com",
      }),
    ).resolves.toBe(page);

    expect(mocks.rowsPage).toHaveBeenCalledWith("prj_1", {
      kind: "queries",
      limit: 1_000,
      offset: 50,
      period: "90",
      property: "sc-domain:archived.example.com",
    });
  });

  it("requires the canonical property for every table kind", async () => {
    for (const kind of ["pages", "queries"] as const) {
      await expect(
        loadSearchInsightsRows({ kind, limit: 10, offset: 0, projectId: "prj_1" }),
      ).rejects.toThrow();
    }
    expect(mocks.rowsPage).not.toHaveBeenCalled();
  });

  it("bounds provider property identifiers", async () => {
    await expect(
      loadSearchInsightsRows({
        kind: "pages",
        limit: 10,
        offset: 0,
        projectId: "prj_1",
        property: "x".repeat(301),
      }),
    ).rejects.toThrow();
    expect(mocks.rowsPage).not.toHaveBeenCalled();
  });

  it("refuses a page bigger than one click is allowed to ask for", async () => {
    await expect(
      loadSearchInsightsRows({
        kind: "pages",
        limit: ROWS_PAGE_LIMIT + 1,
        offset: 0,
        projectId: "prj_1",
        property: "sc-domain:example.com",
      }),
    ).rejects.toThrow();
    expect(mocks.rowsPage).not.toHaveBeenCalled();
  });

  it("refuses to page deeper than a table ever reaches", async () => {
    // Every page re-aggregates the whole window before it skips, so a deep offset is the
    // expensive request; nothing on screen ever asks past the cap.
    await expect(
      loadSearchInsightsRows({
        kind: "queries",
        limit: 10,
        offset: SEARCH_INSIGHTS_ROWS_CAP + 1,
        projectId: "prj_1",
        property: "sc-domain:example.com",
      }),
    ).rejects.toThrow();
    expect(mocks.rowsPage).not.toHaveBeenCalled();
  });

  it("refuses a table it does not serve", async () => {
    await expect(
      loadSearchInsightsRows({
        kind: "everything",
        limit: 10,
        offset: 0,
        projectId: "prj_1",
        property: "sc-domain:example.com",
      }),
    ).rejects.toThrow();
  });
});
