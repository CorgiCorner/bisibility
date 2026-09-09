import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordGridViewport } from "./KeywordGridViewport";

describe("KeywordGridViewport", () => {
  it("lets the embedding own the outer frame while preserving table separators", () => {
    render(
      <KeywordGridViewport
        columnSizing={{}}
        columns={[]}
        columnVisibility={{}}
        density="standard"
        id="viewport-table"
        onColumnSizingChange={vi.fn()}
        onColumnVisibilityChange={vi.fn()}
        onNavigate={vi.fn()}
        onPaginationChange={vi.fn()}
        onSelectionChange={vi.fn()}
        onSortingChange={vi.fn()}
        pagination={{ page: 1, pageSize: 25, pageSizeOptions: [25, 50, 100], rowCount: 0 }}
        paginationMode="client"
        rows={[]}
        selection={new Set()}
        sorting={{ direction: "asc", field: "position" }}
        sortingMode="client"
      />,
    );

    const viewport = screen.getByTestId("keywords-grid-viewport");
    const ancestorClasses = [];
    let ancestor = viewport.parentElement;
    while (ancestor) {
      ancestorClasses.push(...ancestor.classList);
      ancestor = ancestor.parentElement;
    }

    expect(ancestorClasses).not.toContain("overflow-x-auto");
    expect(viewport).toHaveClass("w-full", "min-w-0");
    expect(viewport).not.toHaveClass("min-w-[1080px]");
    expect(viewport).toHaveClass("[&>[role=table]]:border-0");

    const table = screen.getByRole("table", { name: "Rank tracker keywords" });
    expect(table.parentElement).toBe(viewport);
    expect(table).toHaveClass("border", "border-border");
    expect(screen.getAllByRole("row")[0]).toHaveClass("border-y", "border-t-0", "border-border");
    expect(screen.getByTestId("data-table-footer")).toHaveClass("border-t", "border-border");
  });
});
