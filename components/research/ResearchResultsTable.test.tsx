import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchResultsTable } from "./ResearchResultsTable";

vi.mock("@/components/keywords/grid/DataGrid", () => ({
  DataGrid: (props: {
    columns: Array<{
      field: string;
      renderCell?: (input: { row: GroupedResearchRow }) => ReactNode;
    }>;
    isRowSelectable: (input: { row: GroupedResearchRow }) => boolean;
    onRowClick: (input: { row: GroupedResearchRow }) => void;
    onRowSelectionModelChange: (model: { ids: Set<string> }) => void;
    rows: GroupedResearchRow[];
  }) => {
    return (
      <div>
        <output aria-label="tracked selectable">
          {String(props.isRowSelectable({ row: props.rows[1] as GroupedResearchRow }))}
        </output>
        <table>
          <tbody>
            {props.rows.map((row) => (
              <tr
                data-testid={`row-${row.keyword}`}
                key={row.keyword}
                onClick={() => props.onRowClick({ row })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") props.onRowClick({ row });
                }}
                tabIndex={0}
              >
                {props.columns.map((column) => (
                  <td key={column.field}>{column.renderCell?.({ row })}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={() => props.onRowClick({ row: props.rows[0] as GroupedResearchRow })}
          type="button"
        >
          Open detail
        </button>
        <button
          onClick={() => props.onRowSelectionModelChange({ ids: new Set(["seo tool"]) })}
          type="button"
        >
          Select bulk
        </button>
      </div>
    );
  },
}));

afterEach(() => {
  vi.useRealTimers();
});

function row(keyword: string, alreadyTracked = false, alreadySaved = false): GroupedResearchRow {
  const value = {
    alreadySaved,
    alreadyTracked,
    competition: null,
    cpcCents: null,
    difficulty: 20,
    intent: "commercial" as const,
    keyword,
    monthlyTrend: [],
    searchVolume: 500,
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
      rows={[row("seo tool"), row("tracked", true)]}
      seed="seo"
      selectedKeywords={[]}
      totalCount={2}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("ResearchResultsTable", () => {
  it("keeps detail activation separate from bulk selection and excludes tracked rows", () => {
    const { onActiveChange, onSelectionChange } = renderTable();

    expect(screen.getByLabelText("tracked selectable")).toHaveTextContent("false");
    fireEvent.click(screen.getByRole("button", { name: "Open detail" }));
    expect(onActiveChange).toHaveBeenCalledWith(expect.objectContaining({ keyword: "seo tool" }));
    expect(onSelectionChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Select bulk" }));
    expect(onSelectionChange).toHaveBeenCalledWith(["seo tool"]);
    expect(onActiveChange).toHaveBeenCalledOnce();
  });

  it("shows the priced deeper-run footer and triggers the deeper lookup", () => {
    const { onDeeper } = renderTable();

    const deeperButton = screen.getByRole("button", { name: /run with 500 results/ });
    expect(deeperButton).toHaveTextContent("~$0.06");
    expect(deeperButton).toHaveClass("cursor-pointer", "p-0");
    expect(screen.getByText(/Showing all 2 fetched/)).toBeInTheDocument();
    fireEvent.click(deeperButton);
    expect(onDeeper).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("summarizes the header meta line without the provider segment", () => {
    renderTable();

    const meta = screen.getByText(/of 2 keywords/);
    expect(meta).toHaveTextContent(/keywords - cached/);
    expect(meta.textContent).not.toContain("via");
  });

  it("uses the shared relative-time label for older results", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T16:00:00.000Z"));

    renderTable({ fetchedAt: "2026-07-22T10:00:00.000Z" });

    expect(screen.getByText(/cached yesterday/)).toBeInTheDocument();
  });

  it("shows the persisted matrix cost in checks per run before the add action", () => {
    const { onAddSelected } = renderTable({
      selectedKeywords: ["seo tool"],
      trackingMarketCount: 3,
    });

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: /Add 1 to tracking/ });
    expect(addButton).toHaveTextContent("+3 checks per run");
    expect(addButton).not.toHaveTextContent("$");
    expect(addButton).not.toHaveTextContent("/mo");
    fireEvent.click(addButton);
    expect(onAddSelected).toHaveBeenCalledOnce();
  });

  it("keeps the default single-market cost free of dollar and monthly estimates", () => {
    const selectedKeywords = ["seo tool", "rank tracker", "keyword research"];
    renderTable({
      rows: selectedKeywords.map((keyword) => row(keyword)),
      selectedKeywords,
      totalCount: selectedKeywords.length,
    });

    const addButton = screen.getByRole("button", { name: /Add 3 to tracking/ });
    expect(addButton).toHaveTextContent("+3 checks per run");
    expect(addButton).not.toHaveTextContent("$");
    expect(addButton).not.toHaveTextContent("/mo");
  });

  it("renders unavailable keyword-overview metrics as accessible n/a values", () => {
    renderTable({ metricsAvailable: false });

    for (const label of [
      "Search volume unavailable",
      "Search trend unavailable",
      "KD unavailable",
      "CPC unavailable",
    ]) {
      expect(screen.getAllByLabelText(label)).toHaveLength(2);
      for (const value of screen.getAllByLabelText(label)) expect(value).toHaveTextContent("n/a");
    }
  });

  it("groups the selection summary and bulk actions for responsive layout", () => {
    renderTable({ selectedKeywords: ["seo tool"] });

    expect(screen.getByTestId("research-selection-toolbar")).toHaveClass("@container", "grid");
    expect(
      within(screen.getByTestId("research-selection-summary")).getByRole("button", {
        name: "Clear",
      }),
    ).toBeInTheDocument();

    const actions = within(screen.getByTestId("research-selection-actions"));
    expect(actions.getByRole("button", { name: "Save 1 for later" })).toBeInTheDocument();
    expect(actions.getByRole("button", { name: /Add 1 to tracking/ })).toBeInTheDocument();
    expect(screen.getByTestId("research-selection-actions")).toHaveClass(
      "grid",
      "@lg:grid-cols-2",
      "@4xl:flex",
    );
  });

  it("saves eight selected rows with one bulk callback", () => {
    const rows = Array.from({ length: 8 }, (_, index) => row(`keyword ${index + 1}`));
    const selectedKeywords = rows.map((item) => item.keyword);
    const { onSaveSelected } = renderTable({ rows, selectedKeywords, totalCount: rows.length });

    fireEvent.click(screen.getByRole("button", { name: "Save 8 for later" }));

    expect(onSaveSelected).toHaveBeenCalledOnce();
    expect(onSaveSelected).toHaveBeenCalledWith(rows);
  });

  it("shows saved affordances but lets the tracked badge take precedence", () => {
    renderTable({
      rows: [row("saved keyword", false, true), row("tracked keyword", true, true)],
    });

    const savedRow = within(screen.getByTestId("row-saved keyword"));
    expect(savedRow.getByText("Saved")).toBeInTheDocument();
    expect(savedRow.getByRole("button", { name: "Remove from saved" })).toBeInTheDocument();

    const trackedRow = within(screen.getByTestId("row-tracked keyword"));
    expect(trackedRow.getByText("Tracked")).toBeInTheDocument();
    expect(trackedRow.queryByText("Saved")).not.toBeInTheDocument();
    expect(trackedRow.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the saved badge read-only without remove permission", () => {
    renderTable({
      canRemoveSaved: false,
      rows: [row("saved keyword", false, true), row("tracked keyword", true, true)],
    } as never);

    const savedRow = within(screen.getByTestId("row-saved keyword"));
    expect(savedRow.getByText("Saved")).toBeInTheDocument();
    expect(savedRow.queryByRole("button", { name: "Remove from saved" })).not.toBeInTheDocument();
  });

  it("toggles the hover bookmark without activating the row", () => {
    const { onActiveChange, onToggleSave } = renderTable();
    const unsaved = within(screen.getByTestId("row-seo tool"));

    fireEvent.click(unsaved.getByRole("button", { name: "Save for later" }));

    expect(onToggleSave).toHaveBeenCalledWith(expect.objectContaining({ keyword: "seo tool" }));
    expect(onActiveChange).not.toHaveBeenCalled();
  });
});
