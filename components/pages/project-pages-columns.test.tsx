import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { ProjectPageColumnSource } from "@/lib/pages/types";
import pagesMessages from "@/messages/core/en/project-pages.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { projectPagesColumns } from "./project-pages-columns";
import { pageRow, pageSource } from "./project-pages-fixtures";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages);

function renderColumns(node: ReactNode) {
  return render(
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <DateDisplayProvider>
        <TooltipProvider>{node}</TooltipProvider>
      </DateDisplayProvider>
    </FeatureMessagesProvider>,
  );
}

function columnAt(sources: readonly ProjectPageColumnSource[], id: string) {
  const columns = projectPagesColumns({
    format: { number: (value: number) => String(value) } as never,
    projectId: "prj_1",
    sources,
    t: ((key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key) as never,
  });
  const column = columns.find((item) => item.id === id);
  if (!column) throw new Error(`Missing column ${id}`);
  return column;
}

function cell(sources: readonly ProjectPageColumnSource[], id: string, row = pageRow()) {
  const column = columnAt(sources, id);
  if (typeof column.cell !== "function") throw new Error(`Missing cell ${id}`);
  return column.cell({ row: { original: row } } as never);
}

function heading(sources: readonly ProjectPageColumnSource[], id: string) {
  const column = columnAt(sources, id);
  if (typeof column.header !== "function") throw new Error(`Missing header ${id}`);
  return column.header({} as never);
}

describe("project page metric cells", () => {
  it("renders a dash for a missing or disconnected metric instead of zero", () => {
    const sources = [
      pageSource("search_console", "not_connected"),
      pageSource("rank_tracker", "not_connected"),
      pageSource("sitemap", "not_connected"),
      pageSource("page_indexing", "not_connected"),
    ];
    renderColumns(cell(sources, "clicks", pageRow({ keywords: 0, searchConsole: null })));
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();

    renderColumns(cell(sources, "keywords", pageRow({ keywords: 9 })));
    expect(screen.queryByText("9")).not.toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);

    renderColumns(cell(sources, "sitemap"));
    expect(screen.queryByText("sitemapState.listed")).not.toBeInTheDocument();
    renderColumns(cell(sources, "index"));
    expect(screen.queryByText("indexGroup.not_checked")).not.toBeInTheDocument();
    for (const id of [
      "clicks",
      "impressions",
      "position",
      "sessions",
      "keywords",
      "aiCitations",
      "sitemap",
      "index",
    ]) {
      renderColumns(heading(sources, id));
    }
    expect(screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Search Console is not connected").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Index is not connected")).toBeInTheDocument();
    expect(screen.getByText("Sitemap is not connected")).toBeInTheDocument();
    expect(screen.getByText("Analytics is not connected")).toBeInTheDocument();
    expect(screen.getByText("Rank Tracker is not connected")).toBeInTheDocument();
    expect(screen.getByText("AI visibility is not connected")).toBeInTheDocument();
    expect(screen.getAllByText(/^columns\./u).length).toBeGreaterThan(0);
  });

  it("renders the metric when the source is connected", () => {
    const sources = [
      pageSource("search_console", "connected"),
      pageSource("rank_tracker", "connected"),
    ];
    renderColumns(cell(sources, "clicks"));
    expect(screen.getByText("8")).toBeInTheDocument();
    renderColumns(cell(sources, "keywords"));
    expect(screen.getByRole("link", { name: /keywordsLink/ })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker?q=https%3A%2F%2Fexample.com%2Fdocs",
    );
  });
});
