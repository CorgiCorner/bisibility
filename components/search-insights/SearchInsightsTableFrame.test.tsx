import { renderWithSearchInsightsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsQueriesTable } from "./SearchInsightsRowsTable";
import { queryRows } from "./search-insights-row-test-fixtures";

// The fill layout virtualizes its body; jsdom needs a non-zero scroll height to resolve the range.
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get() {
    return 1200;
  },
});

const HEADER = 42;
const ROW = 56;
const FOOTER = 52;

function paging(rowCount: number) {
  return { onChange: vi.fn(), page: 1, pageSize: 10, rowCount };
}

function frame() {
  return screen.getByRole("table", { name: "Top queries" }).closest("[data-view]") as HTMLElement;
}

describe("SearchInsightsQueriesTable in a card frame", () => {
  it("sizes the inline frame to the rows on the page", () => {
    render(
      <SearchInsightsQueriesTable
        paging={paging(3)}
        rows={queryRows(3)}
        tracked={new Set()}
        view="inline"
      />,
    );

    const container = frame();
    expect(container).toHaveStyle({ height: `${HEADER + 3 * ROW + FOOTER}px` });
    expect(screen.getByTestId("search-insights-queries")).toHaveClass("flex", "h-full", "flex-col");
  });

  it("caps the inline frame at the first page height when the page is larger", () => {
    render(
      <SearchInsightsQueriesTable
        paging={{ onChange: vi.fn(), page: 1, pageSize: 100, rowCount: 100 }}
        rows={queryRows(100)}
        tracked={new Set()}
        view="inline"
      />,
    );

    expect(frame()).toHaveStyle({ height: `${HEADER + 10 * ROW + FOOTER}px` });
    // The footer stays visible so the Rows menu and pager are reachable while the body scrolls.
    expect(within(frame()).getByTestId("data-table-footer")).toBeInTheDocument();
  });

  it("lets the expanded frame flex to the modal height with the fill layout", () => {
    render(
      <SearchInsightsQueriesTable
        paging={paging(100)}
        rows={queryRows(100)}
        tracked={new Set()}
        view="expanded"
      />,
    );

    const container = frame();
    expect(container).toHaveClass("flex-1", "min-h-0");
    expect(container).not.toHaveAttribute("style");
    expect(screen.getByTestId("search-insights-queries")).toHaveClass("flex", "h-full");
  });
});
