import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchInsightsPagesTable } from "./SearchInsightsPagesTable";
import { SearchInsightsQueriesTable } from "./SearchInsightsRowsTable";
import { ORGANIC_SESSIONS_LABEL } from "./search-insights-copy";
import { ROW_HEIGHT, SCROLL_REGION_HEIGHT } from "./search-insights-rows-model";
import { moduleTableMinWidth } from "./search-insights-table-columns";

function queryRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    clicks: 1_000 - index,
    ctr: 0.0573,
    impressions: 22_410,
    position: index === 0 ? 6.2 : 24.6,
    query: `query ${index}`,
  }));
}

const pageRow = {
  clicks: 2_140,
  ctr: 0.035,
  engagementRate: null,
  impressions: 61_300,
  keyEvents: null,
  path: "/blog/self-hosted-rank-tracking",
  position: 12.4,
  sessions: null,
  url: "https://example.com/blog/self-hosted-rank-tracking",
};

describe("SearchInsightsQueriesTable", () => {
  it("is a real table with column headers, not a grid of divs", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(3)} tracked={new Set()} />);

    const table = screen.getByRole("table", { name: "Top queries" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "Query",
      "Clicks",
      "Impr",
      "CTR",
      "Avg pos",
      "Actions",
    ]);
    expect(headers.every((header) => header.getAttribute("scope") === "col")).toBe(true);
  });

  it("does not add external Google links to query rows", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(3)} tracked={new Set()} />);

    expect(screen.queryByRole("link", { name: /^Search Google for / })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("opens a row from the keyboard as well as the pointer", async () => {
    const onOpen = vi.fn();
    render(<SearchInsightsQueriesTable onOpen={onOpen} rows={queryRows(1)} tracked={new Set()} />);

    const row = screen.getAllByRole("row")[1];
    row.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("keeps the Track action out of the row's own open handler", async () => {
    const onOpen = vi.fn();
    const onTrack = vi.fn();
    render(
      <SearchInsightsQueriesTable
        onOpen={onOpen}
        onTrack={onTrack}
        rows={queryRows(1)}
        tracked={new Set()}
      />,
    );

    await userEvent.click(screen.getByTitle("Add this query to Rank Tracker"));

    expect(onTrack).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("keeps the hidden Track action reachable and visible for keyboard users", async () => {
    render(<SearchInsightsQueriesTable rows={queryRows(1)} tracked={new Set()} />);

    const action = screen.getByTitle("Add this query to Rank Tracker");
    await userEvent.tab();
    await userEvent.tab();

    expect(action).toHaveFocus();
    expect(action.className).toContain("focus-visible:opacity-100");
    expect(action.className).toContain("focus-visible:outline-accent-solid");
  });

  it("recognises a tracked query by the key the match ran on, not by its raw text", () => {
    render(
      <SearchInsightsQueriesTable
        rows={[{ ...queryRows(1)[0], query: "  Query 0 " }]}
        tracked={new Set(["query 0"])}
      />,
    );

    expect(screen.getByTitle("Already tracked in Rank Tracker")).toBeInTheDocument();
    expect(screen.queryByTitle("Add this query to Rank Tracker")).not.toBeInTheDocument();
  });

  it("colours a position as a rank bucket, never as a status", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(2)} tracked={new Set()} />);

    expect(screen.getByText("#6.2").className).toContain("text-fg");
    expect(screen.getByText("#24.6").className).toContain("text-fg-muted");
  });

  it("renders only the rows near the scroll offset and accounts for the rest", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(400)} scroll tracked={new Set()} />);

    const table = screen.getByRole("table", { name: "Top queries" });
    const rendered = within(table).getAllByRole("row").length;
    expect(rendered).toBeLessThan(60);
    expect(screen.getByText("query 0")).toBeInTheDocument();
    expect(screen.queryByText("query 300")).not.toBeInTheDocument();

    const region = table.parentElement as HTMLElement;
    Object.defineProperty(region, "scrollTop", { configurable: true, value: ROW_HEIGHT * 300 });
    fireEvent.scroll(region);

    expect(screen.getByText("query 300")).toBeInTheDocument();
    expect(screen.queryByText("query 0")).not.toBeInTheDocument();
    // The spacers stand in for what is not rendered, so the scrollbar still describes 400 rows.
    expect(within(table).getAllByRole("row").length).toBeLessThan(60);
    expect(SCROLL_REGION_HEIGHT).toBe(520);
  });

  it("drops the offset when the region stops scrolling, so expanding paints from the top", () => {
    const { rerender } = render(
      <SearchInsightsQueriesTable rows={queryRows(400)} scroll tracked={new Set()} />,
    );

    const region = screen.getByRole("table", { name: "Top queries" }).parentElement as HTMLElement;
    Object.defineProperty(region, "scrollTop", { configurable: true, value: ROW_HEIGHT * 300 });
    fireEvent.scroll(region);
    expect(screen.queryByText("query 0")).not.toBeInTheDocument();

    // Collapsing takes the overflow away and the browser clamps the element to the top without
    // firing a scroll event, so a kept offset would paint the next expansion blank.
    rerender(<SearchInsightsQueriesTable rows={queryRows(10)} tracked={new Set()} />);
    rerender(<SearchInsightsQueriesTable rows={queryRows(400)} scroll tracked={new Set()} />);

    expect(screen.getByText("query 0")).toBeInTheDocument();
  });
});

describe("the first-view tables", () => {
  it("rules the column header bar top and bottom across both cards", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(1)} tracked={new Set()} />);
    render(<SearchInsightsPagesTable rows={[pageRow]} />);

    for (const name of ["Top queries", "Top pages"]) {
      const table = screen.getByRole("table", { name });
      expect(table.parentElement).toHaveClass("border-t", "border-border");
      for (const header of within(table).getAllByRole("columnheader")) {
        expect(header).toHaveClass("border-b", "border-border");
      }
    }
  });

  it("explicitly aligns text headers left and numeric headers right", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(1)} tracked={new Set()} />);
    render(<SearchInsightsPagesTable rows={[pageRow]} />);

    for (const label of ["Query", "Page"]) {
      const header = screen.getByRole("columnheader", { name: label });
      expect(header.classList).toContain("text-left");
      expect(header.classList).not.toContain("text-right");
    }

    for (const label of ["Clicks", "Impr", "CTR", "Avg pos"]) {
      const headers = screen.getAllByRole("columnheader", { name: label });
      for (const header of headers) {
        expect(header.classList).toContain("text-right");
        expect(header.classList).not.toContain("text-left");
      }
    }
  });

  // A fixed-layout table ignores a min-width on a `<col>`, so the floor only bites on the table
  // itself; the component writes the class out, and this keeps it the shared geometry's sum.
  it("carry the minimum their columns add up to, so the text column cannot collapse", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(1)} tracked={new Set()} />);
    render(<SearchInsightsPagesTable rows={[pageRow]} />);

    expect(screen.getByRole("table", { name: "Top queries" }).className).toContain(
      moduleTableMinWidth.queries,
    );
    expect(screen.getByRole("table", { name: "Top pages" }).className).toContain(
      moduleTableMinWidth.pages,
    );
  });

  // AVG POS is the widest header in the narrowest column; wrapping it makes one header two
  // lines tall while every other one stays on a single line.
  it("keep every column header on one line", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(1)} tracked={new Set()} />);

    for (const header of screen.getAllByRole("columnheader")) {
      expect(header.className).toContain("whitespace-nowrap");
    }
    expect(screen.getByRole("columnheader", { name: "Avg pos" }).className).toContain("px-1");
  });
});

describe("column sort controls", () => {
  const DEFAULT_SORT = { direction: "desc", key: "clicks" } as const;

  function renderQueries(
    sort: { direction: "asc" | "desc"; key: string } = DEFAULT_SORT,
    onSort = vi.fn(),
  ) {
    render(
      <SearchInsightsQueriesTable
        rows={queryRows(3)}
        sort={{ onSort, value: sort as never }}
        tracked={new Set()}
      />,
    );
    return onSort;
  }

  // P7b: every column the read can order by is a control, and Actions is not a column.
  it("makes every readable column a sort control, including the text column", () => {
    renderQueries();

    const table = screen.getByRole("table", { name: "Top queries" });
    const sortable = within(table)
      .getAllByRole("columnheader")
      .filter((header) => header.hasAttribute("aria-sort"));
    expect(sortable.map((header) => header.textContent)).toEqual([
      "Query",
      "Clicks",
      "Impr",
      "CTR",
      "Avg pos",
    ]);
    for (const header of sortable) {
      expect(within(header).getByRole("button")).toHaveClass("gap-2", "overflow-hidden");
    }
  });

  it("insets sortable figures by the sort control so they share the header label's right edge", () => {
    renderQueries();

    const table = screen.getByRole("table", { name: "Top queries" });
    const cells = within(within(table).getAllByRole("row")[1]).getAllByRole("cell");
    for (const cell of cells.slice(1, 5)) {
      expect(cell).toHaveClass("px-1", "pe-5.5");
    }
    expect(cells[5]).not.toHaveClass("pe-5.5");
  });

  it("keeps figures on the header padding when the table is not sortable", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(1)} tracked={new Set()} />);

    const table = screen.getByRole("table", { name: "Top queries" });
    const clicks = within(within(table).getAllByRole("row")[1]).getAllByRole("cell")[1];
    expect(clicks).toHaveClass("px-1");
    expect(clicks).not.toHaveClass("pe-5.5");
  });

  it("marks exactly one column active and leaves the rest unsorted", () => {
    renderQueries({ direction: "asc", key: "ctr" });

    const table = screen.getByRole("table", { name: "Top queries" });
    const states = within(table)
      .getAllByRole("columnheader")
      .filter((header) => header.hasAttribute("aria-sort"))
      .map((header) => header.getAttribute("aria-sort"));
    expect(states).toEqual(["none", "none", "none", "ascending", "none"]);
    expect(states.filter((state) => state !== "none")).toHaveLength(1);
  });

  it("opens a numeric column biggest-first and the text column A to Z", async () => {
    const onSort = renderQueries();

    await userEvent.click(screen.getByRole("button", { name: /Impr/ }));
    expect(onSort).toHaveBeenCalledWith("impressions");

    await userEvent.click(screen.getByRole("button", { name: /Query/ }));
    expect(onSort).toHaveBeenCalledWith("text");
  });

  it("keeps the sessions column a plain label, because the read cannot order by it", () => {
    render(
      <SearchInsightsPagesTable
        lens="traffic"
        rows={[pageRow]}
        showSessions
        sort={{ onSort: vi.fn(), value: DEFAULT_SORT }}
      />,
    );

    const table = screen.getByRole("table", { name: "Top pages" });
    const sessions = within(table)
      .getAllByRole("columnheader")
      .find((header) => header.textContent?.includes(ORGANIC_SESSIONS_LABEL));
    expect(sessions).toBeDefined();
    expect(sessions).not.toHaveAttribute("aria-sort");
    expect(within(sessions as HTMLElement).queryByRole("button")).toBeNull();

    const cells = within(within(table).getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[1]).toHaveClass("pe-5.5");
    expect(cells[2]).not.toHaveClass("pe-5.5");
    expect(cells[3]).not.toHaveClass("pe-5.5");
    expect(cells[4]).toHaveClass("pe-5.5");
  });

  it("leaves the head inert when the table is rendered without a sort controller", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(2)} tracked={new Set()} />);

    const table = screen.getByRole("table", { name: "Top queries" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .some((header) => header.hasAttribute("aria-sort")),
    ).toBe(false);
  });
});
