import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchResultsTable } from "./ResearchResultsTable";
import {
  researchResultsSelectedKeywords,
  researchResultsSelectionIds,
  researchResultsTableRows,
} from "./research-results-table-state";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(620);
});

function row(
  keyword: string,
  options: { alreadySaved?: boolean; alreadyTracked?: boolean; searchVolume?: number } = {},
): GroupedResearchRow {
  const value = {
    alreadySaved: options.alreadySaved ?? false,
    alreadyTracked: options.alreadyTracked ?? false,
    competition: null,
    cpcCents: null,
    difficulty: 20,
    intent: "commercial" as const,
    keyword,
    monthlyTrend: [],
    searchVolume: options.searchVolume ?? 500,
    source: "related" as const,
  };
  return { ...value, variants: [value] };
}

function renderTable(overrides: Partial<Parameters<typeof ResearchResultsTable>[0]> = {}) {
  const handlers = {
    onActiveChange: vi.fn(),
    onAddSelected: vi.fn(),
    onDeeper: vi.fn(),
    onSaveSelected: vi.fn(),
    onSelectionChange: vi.fn(),
    onToggleSave: vi.fn(),
  };
  render(
    <ResearchResultsTable
      activeKeyword={null}
      cached
      canRemoveSaved
      deeper={{ cached: false, costCents: 6, nextLimit: 500 }}
      fetchedAt="2026-07-22T10:00:00.000Z"
      fetchedCount={2}
      filterCount={0}
      onOpenFilters={vi.fn()}
      rows={[row("seo tool"), row("tracked", { alreadyTracked: true })]}
      seed="seo"
      selectedKeywords={[]}
      totalCount={2}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

function resultRows() {
  return within(screen.getByTestId("research-results-table-body")).getAllByRole("row");
}

describe("ResearchResultsTable", () => {
  it("uses normalized stable IDs while retaining keyword-string selections", () => {
    const rows = researchResultsTableRows([row("SEO-tool")]);
    const reformatted = researchResultsTableRows([row("seo tool")]);

    expect(rows[0]?.id).toBe(reformatted[0]?.id);
    const selection = researchResultsSelectionIds(rows, ["SEO-tool"]);
    expect(researchResultsSelectedKeywords(rows, selection, ["hidden keyword"])).toEqual([
      "hidden keyword",
      "SEO-tool",
    ]);
  });

  it("keeps detail activation separate from bulk selection and excludes tracked rows", () => {
    const { onActiveChange, onSelectionChange } = renderTable();
    const researchRow = screen.getByRole("row", { name: /seo tool/i });

    expect(screen.queryByRole("checkbox", { name: "Select tracked" })).not.toBeInTheDocument();
    fireEvent.click(researchRow);
    expect(onActiveChange).toHaveBeenCalledWith(expect.objectContaining({ keyword: "seo tool" }));
    expect(onSelectionChange).not.toHaveBeenCalled();

    fireEvent.click(within(researchRow).getByRole("checkbox", { name: "Select seo tool" }));
    expect(onSelectionChange).toHaveBeenCalledWith(["seo tool"]);
    expect(onActiveChange).toHaveBeenCalledOnce();
  });

  it("uses client sorting with volume descending as the default", () => {
    renderTable({ rows: [row("high", { searchVolume: 900 }), row("low", { searchVolume: 100 })] });

    expect(resultRows()[0]).toHaveTextContent("high");
    fireEvent.click(screen.getByRole("button", { name: "Sort Volume ascending" }));
    expect(resultRows()[0]).toHaveTextContent("low");
    fireEvent.click(screen.getByRole("button", { name: "Clear Volume sorting" }));
    expect(resultRows()[0]).toHaveTextContent("high");
  });

  it("paginates client rows with the T3 page-size contract", () => {
    const rows = Array.from({ length: 51 }, (_, index) =>
      row(`keyword ${index + 1}`, { searchVolume: 51 - index }),
    );
    renderTable({ deeper: null, fetchedCount: rows.length, rows, totalCount: rows.length });

    expect(screen.getByText("1-50 of 51")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("51-51 of 51")).toBeInTheDocument();
    expect(screen.getByText("keyword 51")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rows per page" }));
    fireEvent.click(within(screen.getByRole("menu")).getByText("25"));
    expect(screen.getByText("1-25 of 51")).toBeInTheDocument();
  });

  it("shows the priced deeper-run footer and triggers the deeper lookup", () => {
    const { onDeeper } = renderTable();

    const deeperButton = screen.getByRole("button", { name: /run with 500 results/ });
    expect(deeperButton).toHaveTextContent("~$0.06");
    expect(screen.getByText(/Showing all 2 fetched/)).toBeInTheDocument();
    fireEvent.click(deeperButton);
    expect(onDeeper).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("summarizes fetched results with the shared relative-time label", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T16:00:00.000Z"));
    renderTable({ fetchedAt: "2026-07-22T10:00:00.000Z" });

    expect(screen.getByText(/of 2 keywords - cached yesterday/)).toBeInTheDocument();
  });

  it("keeps selected bulk actions and their matrix check count", () => {
    const { onAddSelected, onSaveSelected } = renderTable({
      selectedKeywords: ["seo tool"],
      trackingMarketCount: 3,
    });

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: /Add 1 to tracking/ });
    expect(addButton).toHaveTextContent("+3 checks per run");
    expect(addButton).not.toHaveTextContent("$");
    fireEvent.click(addButton);
    expect(onAddSelected).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Save 1 for later" }));
    expect(onSaveSelected).toHaveBeenCalledWith([expect.objectContaining({ keyword: "seo tool" })]);
  });

  it("renders unavailable metrics, active state, and an empty filtered result", () => {
    const { rerender } = render(
      <ResearchResultsTable
        activeKeyword="seo tool"
        cached
        canRemoveSaved
        deeper={null}
        fetchedAt="2026-07-22T10:00:00.000Z"
        fetchedCount={1}
        filterCount={0}
        metricsAvailable={false}
        onActiveChange={vi.fn()}
        onAddSelected={vi.fn()}
        onDeeper={vi.fn()}
        onOpenFilters={vi.fn()}
        onSaveSelected={vi.fn()}
        onSelectionChange={vi.fn()}
        onToggleSave={vi.fn()}
        rows={[row("seo tool")]}
        seed="seo"
        selectedKeywords={[]}
        totalCount={1}
      />,
    );
    const activeRow = screen.getByRole("row", { name: /seo tool/i });
    expect(activeRow).toHaveClass(
      "!bg-accent-soft",
      "![--dt-row-background:var(--accent-soft)]",
      "shadow-[inset_2px_0_0_var(--accent)]",
      "[&_[data-column-id=selection]]:shadow-[inset_2px_0_0_var(--accent)]",
    );
    const selectionCell = within(activeRow)
      .getByRole("checkbox", { name: "Select seo tool" })
      .closest('[data-column-id="selection"]');
    expect(selectionCell).toHaveAttribute("data-column-id", "selection");
    expect(activeRow.querySelector('[data-column-id="keyword"]')).toBeInTheDocument();
    for (const label of [
      "Search volume unavailable",
      "Search trend unavailable",
      "KD unavailable",
      "CPC unavailable",
    ]) {
      expect(screen.getByLabelText(label)).toHaveTextContent("n/a");
    }

    rerender(
      <ResearchResultsTable
        activeKeyword={null}
        cached
        canRemoveSaved
        deeper={null}
        fetchedAt="2026-07-22T10:00:00.000Z"
        fetchedCount={0}
        filterCount={1}
        onActiveChange={vi.fn()}
        onAddSelected={vi.fn()}
        onDeeper={vi.fn()}
        onOpenFilters={vi.fn()}
        onSaveSelected={vi.fn()}
        onSelectionChange={vi.fn()}
        onToggleSave={vi.fn()}
        rows={[]}
        seed="seo"
        selectedKeywords={[]}
        totalCount={1}
      />,
    );
    expect(screen.getByText("No keywords match these filters.")).toBeInTheDocument();
  });

  it("preserves saved affordances and prevents the bookmark from opening a row", () => {
    const { onActiveChange, onToggleSave } = renderTable({
      rows: [
        row("saved keyword", { alreadySaved: true }),
        row("tracked keyword", { alreadySaved: true, alreadyTracked: true }),
      ],
    });
    const savedRow = screen.getByRole("row", { name: /saved keyword/i });
    const trackedRow = screen.getByRole("row", { name: /tracked keyword/i });

    expect(within(savedRow).getByText("Saved")).toBeInTheDocument();
    expect(within(savedRow).getByRole("button", { name: "Remove from saved" })).toBeInTheDocument();
    expect(within(trackedRow).getByText("Tracked")).toBeInTheDocument();
    expect(within(trackedRow).queryByText("Saved")).not.toBeInTheDocument();

    fireEvent.click(within(savedRow).getByRole("button", { name: "Remove from saved" }));
    expect(onToggleSave).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: "saved keyword" }),
    );
    expect(onActiveChange).not.toHaveBeenCalled();
  });

  it("keeps responsive selection groups and the card-owned table frame", () => {
    renderTable({ selectedKeywords: ["seo tool"] });

    expect(screen.getByTestId("research-selection-toolbar")).toHaveClass("@container", "grid");
    expect(screen.getByTestId("research-selection-actions")).toHaveClass(
      "grid",
      "@lg:grid-cols-2",
      "@4xl:flex",
    );
    expect(screen.getByTestId("research-results-viewport")).toHaveClass(
      "min-w-0",
      "[&>[role=table]]:border-0",
    );
  });
});
