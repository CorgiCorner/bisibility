import { AVG_POSITION_TIP, NEUTRAL_COPY } from "@/components/search-insights/search-insights-copy";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { storyPageDetail, storyQueryDetail } from "./drawer-story-fixtures";
import { SearchInsightsDrawerContent } from "./SearchInsightsDrawerContent";

const measuredZeroPage = {
  ...storyPageDetail,
  path: "/alternatives/ahrefs",
  perDay: Array.from({ length: 7 }, (_, index) => ({
    clicks: 0,
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
  })),
  queries: { rows: [], total: 0 },
  stats: { clicks: 0, ctr: 0, impressions: 44, position: 8.3 },
  url: "https://example.com/alternatives/ahrefs",
};

function renderContent(content: Parameters<typeof SearchInsightsDrawerContent>[0]["content"]) {
  return render(
    <SearchInsightsDrawerContent
      content={content}
      namedQueryCount={0}
      onOpen={vi.fn()}
      onShowAll={vi.fn()}
      seen={new Set()}
    />,
  );
}

describe("SearchInsightsDrawerContent", () => {
  it("presents a measured-zero page without pretending it has no data", () => {
    renderContent({ detail: measuredZeroPage, kind: "page" });

    const stats = screen.getAllByText(/^(0|44|0.0%|8.3)$/).map((node) => node.textContent);
    expect(stats).toEqual(["0", "44", "0.0%", "8.3"]);
    expect(screen.queryByText("#8.3")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "No clicks on any of these 7 days. The impressions above are views without a click.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(NEUTRAL_COPY.storedRows)).toBeInTheDocument();
    expect(
      screen.getByText(
        "No named queries for this page. Google hides low-volume query text for privacy - all 44 impressions came from queries it does not name.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("0 of 0")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Queries landing here" })).not.toBeInTheDocument();
    expect(screen.getAllByTitle("0 clicks")).toHaveLength(7);
    expect(screen.getAllByTitle("0 clicks")[0]).toHaveStyle({ height: "2%" });
  });

  it("keeps an empty query pivot separate from page privacy copy", () => {
    renderContent({
      detail: { ...storyQueryDetail, pages: { rows: [], total: 0 } },
      kind: "query",
    });

    expect(
      screen.queryByText(/Google hides low-volume query text for privacy/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("0 page")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Your page ranking for it" })).toBeInTheDocument();
  });

  it("labels the page pivot columns and keeps zero clicks under Clicks", () => {
    renderContent({
      detail: {
        ...storyPageDetail,
        queries: {
          ...storyPageDetail.queries,
          rows: [{ ...storyPageDetail.queries.rows[0], clicks: 0 }],
        },
      },
      kind: "page",
    });

    const table = screen.getByRole("table", { name: "Queries landing here" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Query", "Clicks", "Avg pos"]);
    expect(headers[0]).toHaveAttribute("scope", "col");
    expect(headers[0]).toHaveClass("text-left");
    expect(headers[1]).toHaveClass("text-right");
    expect(headers[2]).toHaveClass("text-right");
    expect(headers[2]).toHaveAttribute("title", AVG_POSITION_TIP);

    const cells = within(table).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["rank tracking software", "0", "#4.2"]);
    expect(cells[1]).toHaveTextContent("0");
    expect(cells[2]).toHaveTextContent("#4.2");
  });

  it.each([
    {
      detail: {
        ...storyQueryDetail,
        pages: { rows: [storyQueryDetail.pages.rows[0]], total: 1 },
      },
      heading: "Your page ranking for it",
    },
    { detail: storyQueryDetail, heading: "Your pages competing for it" },
  ])("labels the query pivot columns under $heading", ({ detail, heading }) => {
    renderContent({ detail, kind: "query" });

    const table = screen.getByRole("table", { name: heading });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Page", "Clicks", "Avg pos"]);
    expect(headers[0]).toHaveClass("text-left");
    expect(headers[1]).toHaveClass("text-right");
    expect(headers[2]).toHaveClass("text-right");
    expect(headers[2]).toHaveAttribute("title", AVG_POSITION_TIP);
  });

  it("leaves a normal page pivot and nonzero chart unchanged", () => {
    renderContent({ detail: storyPageDetail, kind: "page" });

    expect(screen.getByText("3 of 12")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Queries landing here" })).toBeInTheDocument();
    expect(screen.getAllByTitle(/clicks$/).some((bar) => bar.style.height === "100%")).toBe(true);
  });
});
