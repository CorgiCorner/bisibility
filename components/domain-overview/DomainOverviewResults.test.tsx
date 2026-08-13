import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DomainOverviewKeywordsTable } from "./DomainOverviewKeywordsTable";
import { DomainOverviewPagesTable } from "./DomainOverviewPagesTable";
import { DomainOverviewResults } from "./DomainOverviewResults";
import { domainOverviewMarketFixture, domainOverviewReportFixture } from "./fixtures";

const handlers = {
  onLoadHistory: () => {},
  onLoadMoreKeywords: () => {},
  onLoadMorePages: () => {},
};

describe("DomainOverviewResults", () => {
  it("renders the complete report with truthful preview controls", () => {
    render(
      <DomainOverviewResults
        history={null}
        historyError={false}
        historyEstimateCents={12}
        historyLoading={false}
        market={domainOverviewMarketFixture}
        {...handlers}
        projectRef="prj_1"
        report={domainOverviewReportFixture}
        tableEstimateCents={{ keywords: 2, pages: 3 }}
        tableError={null}
        tableFetchedCount={{ keywords: 100, pages: 100 }}
        tableHasMore={{ keywords: true, pages: true }}
        tableLoading={null}
      />,
    );
    expect(screen.getByText("Top organic keywords")).toBeInTheDocument();
    expect(screen.getByText("Top pages")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add to saved keywords/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /load history/i })).toHaveTextContent("$0.12");
    expect(screen.getByText(/cached, free for/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /analyze backlinks/i })).toHaveAttribute(
      "href",
      "/app/prj_1/backlinks?target=example.com",
    );
    expect(screen.queryByText(/change item/i)).not.toBeInTheDocument();
    expect(screen.getByText("Ranking changes")).toBeInTheDocument();
    expect(screen.getByText(/index updated Aug 12/i)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /keyword movements/i })).toBeInTheDocument();
  });

  it("does not present missing index metrics as real zeros", () => {
    render(
      <DomainOverviewResults
        history={null}
        historyError={false}
        historyEstimateCents={12}
        historyLoading={false}
        market={domainOverviewMarketFixture}
        {...handlers}
        projectRef="prj_1"
        report={{ ...domainOverviewReportFixture, overview: null, state: "no_data" }}
        tableEstimateCents={{ keywords: 2, pages: 3 }}
        tableError={null}
        tableFetchedCount={{ keywords: 100, pages: 100 }}
        tableHasMore={{ keywords: false, pages: false }}
        tableLoading={null}
      />,
    );
    expect(screen.getByText("No index data for this domain")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Organic performance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Index coverage" })).toBeInTheDocument();
    expect(screen.getByText("No index history to display")).toBeInTheDocument();
    expect(screen.getAllByText("No data")).toHaveLength(6);
    expect(screen.getByText("Est. traffic")).toBeInTheDocument();
    expect(screen.getByText("Organic keywords")).toBeInTheDocument();
    expect(screen.queryByText("Top organic keywords")).not.toBeInTheDocument();
  });

  it("renders and sorts every fetched keyword row before offering the next paid page", () => {
    const onLoadMore = vi.fn();
    const base = domainOverviewReportFixture.keywords;
    if (!base.ok) throw new Error("Keyword fixture must be available");
    const rows = base.data.rows.map((row, index) => ({
      ...row,
      estimatedTraffic: index === 99 ? null : index,
      keyword: `keyword ${index.toString().padStart(3, "0")}`,
      rankAbsoluteDelta: index === 98 ? null : 100 - index,
    }));
    render(
      <DomainOverviewKeywordsTable
        estimateCents={2}
        onLoadMore={onLoadMore}
        page={{ ...base.data, rows, totalCount: 938 }}
      />,
    );

    expect(screen.getAllByTestId("domain-keyword-row")).toHaveLength(100);
    expect(screen.getByText("keyword 050")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort Volume descending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort SERP Δ descending" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sort Est. traffic ascending" }));
    const sortedRows = screen.getAllByTestId("domain-keyword-row");
    const lastRow = sortedRows.at(-1);
    if (!lastRow) throw new Error("Expected a final keyword row");
    expect(within(sortedRows[0]).getByText("keyword 000")).toBeInTheDocument();
    expect(within(lastRow).getByText("keyword 099")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sort SERP Δ descending" }));
    const deltaRows = screen.getAllByTestId("domain-keyword-row");
    const finalDeltaRow = deltaRows.at(-1);
    if (!finalDeltaRow) throw new Error("Expected a final keyword row after delta sorting");
    expect(within(deltaRows[0]).getByText("keyword 000")).toBeInTheDocument();
    expect(within(finalDeltaRow).getByText("keyword 098")).toBeInTheDocument();
    const loadButton = screen.getByRole("button", { name: /load next 100 keywords.*\$0\.02/i });
    expect(loadButton).toHaveClass("MuiButton-outlined");
    fireEvent.click(loadButton);
    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(screen.getByText(/sorting the fetched rows is free/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        "100 fetched keywords · 938 total · 838 remaining · 9 provider requests remaining at up to 100 rows",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/filtering/i)).not.toBeInTheDocument();
  });

  it("selects fetched keywords by stable row identity and saves only the checked rows", async () => {
    const base = domainOverviewReportFixture.keywords;
    if (!base.ok) throw new Error("Keyword fixture must be available");
    const onSaveSelected = vi.fn().mockResolvedValue({
      created: [{ keyword: "ergonomic desk", publicId: "svkw_1" }],
      duplicateCount: 98,
      savedCount: 1,
    });
    render(<DomainOverviewKeywordsTable onSaveSelected={onSaveSelected} page={base.data} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select all fetched keywords" }));
    expect(
      screen.getByRole("button", { name: "Add 100 selected to saved keywords" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select keyword standing desk" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort Keyword ascending" }));
    expect(screen.getByRole("checkbox", { name: "Select keyword ergonomic desk" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Add 99 selected to saved keywords" }));

    await waitFor(() => expect(onSaveSelected).toHaveBeenCalledOnce());
    expect(onSaveSelected.mock.calls[0]?.[0]).toHaveLength(99);
    expect(await screen.findByText("1 keyword added to Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to saved keywords" })).toBeDisabled();
  });

  it("uses readable compact estimates while preserving the exact value on hover", () => {
    const keywords = domainOverviewReportFixture.keywords;
    const pages = domainOverviewReportFixture.pages;
    if (!keywords.ok || !pages.ok) throw new Error("Table fixtures must be available");

    const { rerender } = render(
      <DomainOverviewKeywordsTable
        page={{
          ...keywords.data,
          rows: [{ ...keywords.data.rows[0], estimatedTraffic: 1_413.3 }],
        }}
      />,
    );
    expect(screen.getByText("1.4K")).toHaveAttribute("title", "1,413.3");

    rerender(
      <DomainOverviewPagesTable
        result={{ ...pages.data, rows: [{ ...pages.data.rows[0], etv: 142.065 }] }}
      />,
    );
    expect(screen.getByText("142.1")).toHaveAttribute("title", "142.065");
  });

  it("fails closed while the next-page estimate is unavailable", () => {
    const base = domainOverviewReportFixture.keywords;
    if (!base.ok) throw new Error("Keyword fixture must be available");
    render(
      <DomainOverviewKeywordsTable
        estimateCents={null}
        onLoadMore={() => {}}
        page={{ ...base.data, totalCount: 938 }}
      />,
    );

    expect(screen.getByRole("button", { name: /load next 100 keywords/i })).toBeDisabled();
  });

  it("sorts all fetched pages and keeps missing values last", () => {
    const base = domainOverviewReportFixture.pages;
    if (!base.ok) throw new Error("Page fixture must be available");
    const rows = base.data.rows.map((row, index) => ({
      ...row,
      etv: index === 99 ? null : index,
      etvDeltaPct: index === 98 ? null : 100 - index,
      path: `/page-${index.toString().padStart(3, "0")}`,
    }));
    render(
      <DomainOverviewPagesTable
        estimateCents={3}
        fetchedCount={200}
        onLoadMore={() => {}}
        result={{ ...base.data, rows, totalCount: 1_204 }}
      />,
    );

    expect(screen.getAllByTestId("domain-page-row")).toHaveLength(100);
    expect(screen.getByRole("button", { name: "Sort Page ascending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort Keywords descending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort Traffic Δ descending" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sort Est. traffic ascending" }));
    const sortedRows = screen.getAllByTestId("domain-page-row");
    const lastRow = sortedRows.at(-1);
    if (!lastRow) throw new Error("Expected a final page row");
    expect(within(sortedRows[0]).getByText("/page-000")).toBeInTheDocument();
    expect(within(lastRow).getByText("/page-099")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sort Traffic Δ descending" }));
    const deltaRows = screen.getAllByTestId("domain-page-row");
    const finalDeltaRow = deltaRows.at(-1);
    if (!finalDeltaRow) throw new Error("Expected a final page row after delta sorting");
    expect(within(deltaRows[0]).getByText("/page-000")).toBeInTheDocument();
    expect(within(finalDeltaRow).getByText("/page-098")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load next 100 pages.*\$0\.03/i })).toHaveClass(
      "MuiButton-outlined",
    );
    expect(
      screen.getByText(
        "200 fetched pages · 1,204 total · 1,004 remaining · 11 provider requests remaining at up to 100 rows",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export fetched pages as CSV" })).toBeEnabled();
  });
});
