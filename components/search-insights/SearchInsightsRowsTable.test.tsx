import { stubResizeObserver } from "@/tests/observers";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInsightsPagesTable } from "./SearchInsightsPagesTable";
import { SearchInsightsQueriesTable } from "./SearchInsightsRowsTable";
import { ORGANIC_SESSIONS_LABEL } from "./search-insights-copy";

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

beforeEach(() => {
  localStorage.clear();
  stubResizeObserver();
});

describe("SearchInsightsQueriesTable", () => {
  it("uses the shared ARIA DataTable with its former headers", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(3)} tracked={new Set()} />);

    const table = screen.getByRole("table", { name: "Top queries" });
    expect(table.tagName).toBe("DIV");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Query", "Clicks", "Impr", "CTR", "Avg pos", "Actions"]);
    expect(table).toHaveAttribute("data-layout", "auto");
    expect(table.querySelector("table")).toBeNull();
  });

  it("keeps text left-aligned and figures end-aligned within the declared column sizes", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(1)} tracked={new Set()} />);

    const table = screen.getByRole("table", { name: "Top queries" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers[0]).not.toHaveClass("justify-end");
    expect(headers.slice(1).every((header) => header.className.includes("justify-end"))).toBe(true);
    expect(table).toHaveStyle("--dt-col-clicks: 80px; --dt-col-impressions: 72px");
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

  it("keeps Track out of the row open handler", async () => {
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

    expect(onTrack).toHaveBeenCalledWith(expect.objectContaining({ query: "query 0" }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("keeps a hidden Track action reachable for keyboard users", async () => {
    render(<SearchInsightsQueriesTable rows={queryRows(1)} tracked={new Set()} />);

    const action = screen.getByTitle("Add this query to Rank Tracker");
    action.focus();

    expect(action).toHaveFocus();
    expect(action.tabIndex).toBe(0);
    expect(action).toHaveClass("focus-visible:opacity-100", "focus-visible:outline-accent-solid");
  });

  it("recognises a tracked query by its normalized tracking key", () => {
    render(
      <SearchInsightsQueriesTable
        rows={[{ ...queryRows(1)[0], query: "  Query 0 " }]}
        tracked={new Set(["query 0"])}
      />,
    );

    expect(screen.getByTitle("Already tracked in Rank Tracker")).toBeInTheDocument();
    expect(screen.queryByTitle("Add this query to Rank Tracker")).not.toBeInTheDocument();
  });

  it("keeps rank buckets and settled compact density", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(2)} tracked={new Set()} />);

    expect(screen.getByText("#6.2")).toHaveClass("text-fg");
    expect(screen.getByText("#24.6")).toHaveClass("text-fg-muted");
    expect(screen.getByText("query 0").closest('[role="row"]')).toHaveStyle({ height: "56px" });
  });

  it("keeps 5,000 expanded rows in the bounded virtualized region", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(520);
    render(<SearchInsightsQueriesTable rows={queryRows(5_000)} scroll tracked={new Set()} />);

    const table = screen.getByRole("table", { name: "Top queries" });
    const body = within(table).getByTestId("search-insights-queries-body");
    expect(table).toHaveAttribute("data-layout", "fill");
    expect(table.parentElement).toHaveClass("h-130");
    expect(table).toHaveAttribute("aria-rowcount", "5000");
    expect(body.childElementCount).toBeLessThan(40);
    expect(screen.queryByText("query 4999")).not.toBeInTheDocument();

    table.scrollTop = 56 * 4_990;
    fireEvent.scroll(table);

    expect(screen.getByText("query 4999")).toBeInTheDocument();
  });

  it("forwards server sort keys while preserving the current key on clear", async () => {
    const onSort = vi.fn();
    render(
      <SearchInsightsQueriesTable
        rows={queryRows(2)}
        sort={{ onSort, value: { direction: "desc", key: "clicks" } }}
        tracked={new Set()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Sort Impressions descending" }));
    expect(onSort).toHaveBeenCalledWith("impressions");
    expect(screen.getByRole("columnheader", { name: /Clicks/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("makes each readable query column sortable and keeps Actions inert", () => {
    render(
      <SearchInsightsQueriesTable
        rows={queryRows(2)}
        sort={{ onSort: vi.fn(), value: { direction: "desc", key: "clicks" } }}
        tracked={new Set()}
      />,
    );

    const headers = within(screen.getByRole("table", { name: "Top queries" })).getAllByRole(
      "columnheader",
    );
    expect(headers.filter((header) => header.hasAttribute("aria-sort"))).toHaveLength(5);
    expect(within(headers[5]).queryByRole("button")).toBeNull();
  });

  it("leaves query headers inert when no server sort controller is present", () => {
    render(<SearchInsightsQueriesTable rows={queryRows(2)} tracked={new Set()} />);

    const headers = within(screen.getByRole("table", { name: "Top queries" })).getAllByRole(
      "columnheader",
    );
    expect(headers.some((header) => header.hasAttribute("aria-sort"))).toBe(false);
  });
});

describe("SearchInsightsPagesTable", () => {
  it("renders typed page cells without legacy table markup", () => {
    render(<SearchInsightsPagesTable rows={[pageRow]} />);

    const table = screen.getByRole("table", { name: "Top pages" });
    expect(table.tagName).toBe("DIV");
    expect(table.querySelector("td")).toBeNull();
    expect(within(table).getByText(pageRow.path)).toBeInTheDocument();
    expect(
      within(table).getByRole("link", {
        name: "Open https://example.com/blog/self-hosted-rank-tracking",
      }),
    ).toHaveAttribute("href", pageRow.url);
    expect(within(table).getByRole("columnheader", { name: "Actions" })).toHaveAttribute(
      "title",
      "Actions",
    );
  });

  it("keeps sessions as a plain label because the server cannot sort that join", () => {
    render(
      <SearchInsightsPagesTable
        lens="traffic"
        rows={[pageRow]}
        showSessions
        sort={{ onSort: vi.fn(), value: { direction: "desc", key: "clicks" } }}
      />,
    );

    const sessions = within(screen.getByRole("table", { name: "Top pages" }))
      .getAllByRole("columnheader")
      .find((header) => header.textContent === ORGANIC_SESSIONS_LABEL) as HTMLElement;
    expect(sessions).not.toHaveAttribute("aria-sort");
    expect(within(sessions).queryByRole("button")).toBeNull();
  });
});
