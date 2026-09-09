import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsPagesTable } from "./SearchInsightsPagesTable";
import { SearchInsightsRowsCard, type SearchInsightsRowsCardProps } from "./SearchInsightsRowsCard";
import { SearchInsightsQueriesTable } from "./SearchInsightsRowsTable";

function card(props: Partial<SearchInsightsRowsCardProps> = {}) {
  const { children = <div>Rows</div>, ...rest } = props;
  return (
    <SearchInsightsRowsCard
      caption="Stored rows"
      onCollapse={vi.fn()}
      onMore={vi.fn()}
      show={10}
      shown={10}
      title="Top queries"
      total={184}
      {...rest}
    >
      {children}
    </SearchInsightsRowsCard>
  );
}

function section(title = "Top queries") {
  return screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;
}

describe("SearchInsightsRowsCard", () => {
  it("shows the capped row count without promising the whole property", () => {
    render(card({ show: "all", shown: 5_000, total: 120_000 }));
    expect(screen.getByText("5,000 of 120,000")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show all|Show top 5,000/ })).toBeNull();
  });

  it("places the counter next to the expander, not opposite the title", () => {
    render(card());
    const heading = within(section()).getByRole("heading", { name: "Top queries" });
    const more = within(section()).getByRole("button", { name: "Show more" });
    const footer = more.parentElement as HTMLElement;
    const counter = within(footer).getByText("10 of 184");

    expect(heading.parentElement).not.toContainElement(counter);
    expect(counter.tagName).toBe("SPAN");
    expect(counter).toHaveClass("font-sans", "tabular-nums", "text-ui-caption", "text-fg-muted");
    expect(counter).not.toHaveClass("px-2", "py-0.5");
    expect(within(section()).queryByRole("button", { name: /10 of 184/ })).toBeNull();
  });

  it("keeps the counter visually stable after expansion", () => {
    const { rerender } = render(card());
    const collapsedCounter = within(section()).getByText("10 of 184");

    rerender(card({ show: 50, shown: 50 }));
    const expandedCounter = within(section()).getByText("50 of 184");

    expect(expandedCounter.tagName).toBe("SPAN");
    expect(expandedCounter.className).toBe(collapsedCounter.className);
    expect(within(section()).queryByRole("button", { name: /50 of 184/ })).toBeNull();
  });

  it("pins a header control opposite the title group without stretching its gap", () => {
    render(card({ headerEnd: <button type="button">Lens</button> }));
    const heading = within(section()).getByRole("heading", { name: "Top queries" });
    const caption = within(section()).getByText("Stored rows");
    const lens = within(section()).getByRole("button", { name: "Lens" });
    const titleGroup = heading.parentElement as HTMLElement;
    const header = titleGroup.parentElement as HTMLElement;

    expect(titleGroup).toContainElement(caption);
    expect(titleGroup).toHaveClass("gap-1");
    expect(titleGroup).not.toContainElement(lens);
    expect(header).toHaveClass("items-start", "justify-between");
    expect(header).toContainElement(lens);
  });

  it("pins a footer action to the expander row, opposite the counter", () => {
    render(card({ footerEnd: <a href="/manage">Manage GA4</a> }));
    const more = within(section()).getByRole("button", { name: "Show more" });
    const footer = more.parentElement as HTMLElement;
    const action = within(footer).getByRole("link", { name: "Manage GA4" });

    expect(
      within(section()).getByRole("heading", { name: "Top queries" }).parentElement,
    ).not.toContainElement(action);
    expect(action.parentElement).toHaveClass("ms-auto");
  });

  it("opens a footer for a trailing action even when the table has no expander", () => {
    render(
      card({
        children: (
          <table>
            <tbody>
              <tr className="border-b border-border">
                <td>Row</td>
              </tr>
            </tbody>
          </table>
        ),
        footerEnd: <a href="/manage">Manage GA4</a>,
        shown: 1,
        total: 1,
      }),
    );

    const tableWrap = within(section()).getByText("Row").closest("div") as HTMLElement;
    const action = within(section()).getByRole("link", { name: "Manage GA4" });

    expect(tableWrap).not.toHaveClass("[&_tbody_tr:last-child]:border-b-0");
    expect(within(section()).queryByText("1 of 1")).toBeNull();
    expect(action.parentElement).toHaveClass("ms-auto");
  });

  it("puts collapse before the remaining expansion action with a twelve pixel gap", () => {
    render(card({ show: 50, shown: 50 }));
    const cardSection = section();
    const collapse = within(cardSection).getByRole("button", { name: "Show top 10" });
    const more = within(cardSection).getByRole("button", { name: "Show all 184" });
    const footer = collapse.parentElement as HTMLElement;

    expect(footer).toHaveClass("gap-3");
    expect(footer).not.toHaveClass("border-t");
    expect(collapse.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(more).toHaveAttribute("data-size", "xs");
    expect(collapse).toHaveAttribute("data-size", "xs");
    expect(within(footer).getByText("50 of 184")).toBeInTheDocument();
    expect(within(footer).queryByText(/more stored/)).toBeNull();
  });

  it("drops the card title divider when rows follow, because the table head already rules itself off", () => {
    render(card());
    const header = within(section()).getByRole("heading", { name: "Top queries" }).parentElement
      ?.parentElement as HTMLElement;

    expect(header).not.toHaveClass("border-b");
  });

  it("suppresses the duplicate DataTable frame when there is no pagination footer", () => {
    render(
      card({
        children: (
          <SearchInsightsQueriesTable
            rows={[{ clicks: 10, ctr: 0.1, impressions: 100, position: 2, query: "stored query" }]}
            tracked={new Set()}
          />
        ),
        shown: 1,
        total: 1,
      }),
    );

    const table = within(section()).getByRole("table", { name: "Top queries" });
    expect(table.parentElement).toHaveClass("[&_[role=table]]:border-0");
    expect(within(section()).queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(within(section()).queryByText("1 of 1")).toBeNull();
  });

  it("keeps a standalone DataTable frame", () => {
    render(
      <SearchInsightsQueriesTable
        rows={[{ clicks: 10, ctr: 0.1, impressions: 100, position: 2, query: "stored query" }]}
        tracked={new Set()}
      />,
    );

    expect(screen.getByRole("table", { name: "Top queries" })).toHaveClass(
      "border",
      "border-border",
    );
  });

  it("reaches an expanded table frame through its fixed-height virtualization region", () => {
    render(
      card({
        children: (
          <SearchInsightsQueriesTable
            rows={[
              {
                clicks: 10,
                ctr: 0.1,
                impressions: 100,
                position: 2,
                query: "expanded query",
              },
            ]}
            scroll
            tracked={new Set()}
          />
        ),
        show: "all",
        shown: 184,
        total: 184,
      }),
    );

    const table = within(section()).getByRole("table");
    const tableWrap = table.parentElement?.parentElement as HTMLElement;
    expect(tableWrap).toHaveClass("[&_[role=table]]:border-0");
    expect(table.parentElement).toHaveClass("h-130");
  });

  it("reaches an expanded pages frame through its fixed-height virtualization region", () => {
    render(
      card({
        children: (
          <SearchInsightsPagesTable
            rows={[
              {
                clicks: 10,
                ctr: 0.1,
                engagementRate: null,
                impressions: 100,
                keyEvents: null,
                path: "/expanded-page",
                position: 2,
                sessions: null,
                url: "https://example.com/expanded-page",
              },
            ]}
            scroll
          />
        ),
        show: "all",
        shown: 184,
        title: "Top pages",
        total: 184,
      }),
    );

    const table = within(section("Top pages")).getByRole("table");
    expect(table.parentElement?.parentElement).toHaveClass("[&_[role=table]]:border-0");
    expect(table.parentElement).toHaveClass("h-130");
  });

  it("keeps the last row divider when a pagination footer follows", () => {
    render(
      card({
        children: (
          <table>
            <tbody>
              <tr className="border-b border-border" data-testid="row">
                <td>Row</td>
              </tr>
            </tbody>
          </table>
        ),
        show: 10,
        shown: 10,
        total: 184,
      }),
    );

    const tableWrap = within(section()).getByTestId("row").parentElement?.parentElement
      ?.parentElement as HTMLElement;
    expect(tableWrap).not.toHaveClass("[&_tbody_tr:last-child]:border-b-0");
    expect(within(section()).getByRole("button", { name: /Show more/ })).toBeInTheDocument();
  });

  it("keeps collapse available at the fully expanded state without a zero remainder note", () => {
    render(card({ show: "all", shown: 184 }));
    const cardSection = section();
    const collapse = within(cardSection).getByRole("button", { name: "Show top 10" });
    const footer = collapse.parentElement as HTMLElement;

    expect(footer).not.toHaveClass("border-t");
    expect(within(footer).queryByRole("button", { name: /Show all|Show more/ })).toBeNull();
    expect(within(footer).getByText("184 of 184")).toBeInTheDocument();
    expect(within(footer).queryByText(/0 more stored/)).toBeNull();
  });

  it.each(["Top queries", "Top pages"])(
    "relies on the final row divider above the %s footer",
    (title) => {
      render(card({ title }));
      const more = within(section(title)).getByRole("button", { name: "Show more" });

      expect(more.parentElement).not.toHaveClass("border-t");
    },
  );
});
