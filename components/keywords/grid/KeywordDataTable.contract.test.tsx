import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { asMarketRef } from "@/lib/routing/app-path";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { groupedPendingRows, pendingRows, renderPendingGrid } from "./KeywordsGrid.test-helpers";

function renderedKeywordOrder(keywords: readonly string[]) {
  const body = screen.getByTestId("rank-tracker-keywords-body");
  return [...body.querySelectorAll<HTMLElement>('[role="row"][data-depth="0"]')].flatMap((row) =>
    keywords.filter((keyword) => row.textContent?.includes(keyword)),
  );
}

function renderScopedMarketGrid() {
  setNavigationState({ pathname: "/app/prj_1/m/pmkt_us/rank-tracker" });
  renderPendingGrid(
    {
      matchedTargetCount: 75,
      page: 2,
      pageCount: 3,
      query: {
        filters: emptyKeywordFilters,
        grouped: false,
        lens: { device: "all", locationId: "loc_us" },
        page: 2,
        pageSize: 25,
        savedViewId: null,
        search: "",
        sort: { direction: "asc", field: "position" },
      },
    },
    { locationId: "loc_us", ref: asMarketRef("pmkt_us") },
  );
}

function expectScopedMarketNavigation() {
  expect(routerMock.push).toHaveBeenLastCalledWith(
    expect.stringMatching(/^\/app\/prj_1\/m\/pmkt_us\/rank-tracker\?/),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setNavigationState({ pathname: "/app/prj_1/rank-tracker" });
  stubResizeObserver();
});

describe("KeywordDataTable server contract", () => {
  it("keeps Device compact with previously saved widths and places tracking context after rank changes", () => {
    renderPendingGrid();
    const key = "bv:data-table:rank-tracker-keywords:v1";
    fireEvent(
      window,
      new StorageEvent("storage", {
        key,
        newValue: JSON.stringify({
          columnSizing: { device: 200, keyword: 320 },
          columnVisibility: {},
        }),
      }),
    );
    const table = screen.getByTestId("rank-tracker-keywords");
    try {
      expect(table.style.getPropertyValue("--dt-col-device")).toBe("84px");
      expect(table.style.getPropertyValue("--dt-col-keyword")).toBe("320px");
      expect(
        screen
          .getAllByRole("columnheader")
          .slice(1, 6)
          .map((header) => header.dataset.columnId),
      ).toEqual(["keyword", "position", "change", "location", "device"]);
    } finally {
      fireEvent(window, new StorageEvent("storage", { key, newValue: null }));
    }
  });

  it("navigates sorting instead of reordering the loaded page in the browser", () => {
    const rows = pendingRows();
    const loadedKeywordOrder = rows.map((row) => row.keyword);
    renderPendingGrid({ rows });

    fireEvent.click(screen.getByRole("button", { name: "Sort Position descending" }));

    expect(routerMock.push).toHaveBeenCalledWith(expect.stringMatching(/dir=desc.*page=1/));
    expect(renderedKeywordOrder(loadedKeywordOrder)).toEqual(loadedKeywordOrder);
  });

  it("returns cleared server sorting to the position ascending default", () => {
    renderPendingGrid({
      query: {
        filters: emptyKeywordFilters,
        grouped: false,
        lens: { device: "all", locationId: null },
        page: 2,
        pageSize: 25,
        savedViewId: null,
        search: "",
        sort: { direction: "desc", field: "position" },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear Position sorting" }));

    const href = String(routerMock.push.mock.calls.at(-1)?.[0]);
    const params = new URL(href, "https://example.com").searchParams;
    expect(params.get("sort")).toBe("position");
    expect(params.get("dir")).toBe("asc");
    expect(params.get("page")).toBe("1");
  });

  it("disables Device sorting for grouped server results", () => {
    renderPendingGrid({
      matchedGroupCount: 1,
      query: {
        filters: emptyKeywordFilters,
        grouped: true,
        lens: { device: "all", locationId: null },
        page: 1,
        pageSize: 25,
        savedViewId: null,
        search: "",
        sort: { direction: "asc", field: "position" },
      },
      rows: groupedPendingRows(),
    });

    expect(screen.queryByRole("button", { name: "Sort Device ascending" })).not.toBeInTheDocument();
  });

  it("keeps Device sorting enabled for flat server results", () => {
    renderPendingGrid();

    expect(screen.getByRole("button", { name: "Sort Device ascending" })).toBeInTheDocument();
  });

  it("keeps sorting on the scoped market route", () => {
    renderScopedMarketGrid();

    fireEvent.click(screen.getByRole("button", { name: "Sort Position descending" }));
    expectScopedMarketNavigation();
  });

  it("keeps pagination on the scoped market route", () => {
    renderScopedMarketGrid();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expectScopedMarketNavigation();
  });

  it("keeps grouping on the scoped market route", () => {
    renderScopedMarketGrid();

    fireEvent.click(screen.getByRole("radio", { name: "Grouped" }));
    expectScopedMarketNavigation();
  });

  it("builds the grouped summary from matching leaf targets", () => {
    const [group] = groupedPendingRows();
    if (!group) throw new Error("Expected a grouped fixture row");
    const rows = [
      {
        ...group,
        subRows: group.subRows?.map((row) => ({
          ...row,
          positionHistory: [
            { checkedAt: "2026-08-01T00:00:00.000Z", label: "Aug 1", position: 8 },
            { checkedAt: "2026-08-08T00:00:00.000Z", label: "Aug 8", position: 4 },
          ],
        })),
      },
    ];
    renderPendingGrid({
      matchedGroupCount: 4,
      matchedTargetCount: 100,
      query: {
        filters: emptyKeywordFilters,
        grouped: true,
        lens: { device: "all", locationId: null },
        page: 1,
        pageSize: 25,
        savedViewId: null,
        search: "",
        sort: { direction: "asc", field: "position" },
      },
      rows,
    });

    expect(
      screen.getByRole("status", {
        name: "Current page: 2 of 2 keywords improved this week · no drops",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("100 matching targets")).toBeInTheDocument();
    expect(screen.getByText("1-4 of 4")).toBeInTheDocument();
  });
});
