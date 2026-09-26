import { renderWithSearchInsightsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsPagesTable } from "./SearchInsightsPagesTable";
import { SearchInsightsRowsCard, type SearchInsightsRowsCardProps } from "./SearchInsightsRowsCard";
import { SearchInsightsQueriesTable } from "./SearchInsightsRowsTable";
import { pageRows } from "./search-insights-row-test-fixtures";

const storedQuery = { clicks: 10, ctr: 0.1, impressions: 100, position: 2, query: "stored query" };

function card(props: Partial<SearchInsightsRowsCardProps> = {}) {
  const { children = <div>Rows</div>, ...rest } = props;
  return (
    <SearchInsightsRowsCard caption="Stored rows" empty={false} title="Top queries" {...rest}>
      {children}
    </SearchInsightsRowsCard>
  );
}

function section(title = "Top queries") {
  return screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;
}

describe("SearchInsightsRowsCard", () => {
  it("drops the card title divider when rows follow, because the table head already rules itself off", () => {
    render(card());
    const header = within(section()).getByRole("heading", { name: "Top queries" }).parentElement
      ?.parentElement as HTMLElement;

    expect(header).not.toHaveClass("border-b");
  });

  it("explains an empty window instead of showing the toolbar and the table", () => {
    render(
      card({
        empty: true,
        emptyReason: "Google reported no search traffic.",
        toolbar: <input aria-label="Search queries" />,
      }),
    );

    expect(within(section()).getByText("Google reported no search traffic.")).toBeVisible();
    expect(within(section()).queryByRole("textbox", { name: "Search queries" })).toBeNull();
    expect(within(section()).queryByText("Rows")).toBeNull();
  });

  it("puts the toolbar between the heading and the table", () => {
    render(card({ toolbar: <input aria-label="Search queries" /> }));
    const toolbar = within(section()).getByRole("textbox", { name: "Search queries" })
      .parentElement as HTMLElement;

    expect(toolbar).toHaveClass("flex", "flex-wrap", "px-4", "pb-3");
    expect(toolbar.nextSibling).toBe(within(section()).getByText("Rows"));
  });

  it("lets the table draw its own header rule and server pagination footer", () => {
    const onChange = vi.fn();
    render(
      card({
        children: (
          <SearchInsightsQueriesTable
            bordered={false}
            paging={{ onChange, page: 2, pageSize: 10, rowCount: 184 }}
            rows={[storedQuery]}
            tracked={new Set()}
          />
        ),
      }),
    );

    const table = within(section()).getByRole("table", { name: "Top queries" });
    expect(table).toHaveAttribute("data-bordered", "false");
    expect(within(section()).getByTestId("data-table-footer")).toHaveTextContent("11-20 of 184");
    within(section()).getByRole("button", { name: "Next page" }).click();
    expect(onChange).toHaveBeenCalledWith({ page: 3, pageSize: 10 });
  });

  it("shows the table's own empty state when a search matches nothing", () => {
    render(
      card({
        children: (
          <SearchInsightsPagesTable
            bordered={false}
            paging={{
              emptyState: <p>No rows match "zzz".</p>,
              onChange: vi.fn(),
              page: 1,
              pageSize: 10,
              rowCount: 0,
            }}
            rows={[]}
          />
        ),
        title: "Top pages",
      }),
    );

    expect(within(section("Top pages")).getByText('No rows match "zzz".')).toBeVisible();
  });

  it("keeps a standalone DataTable frame", () => {
    render(<SearchInsightsQueriesTable rows={[storedQuery]} tracked={new Set()} />);

    expect(screen.getByRole("table", { name: "Top queries" })).toHaveClass(
      "border",
      "border-border",
    );
  });

  it("shows only the rows it is given when it has no server pages", () => {
    render(card({ children: <SearchInsightsPagesTable bordered={false} rows={pageRows(3)} /> }));

    expect(within(section()).queryByTestId("data-table-footer")).toBeNull();
    expect(within(section()).getAllByRole("row")).toHaveLength(4);
  });
});
