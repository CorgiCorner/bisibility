import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";
import type { DataTableColumn } from "./data-table-types";

type Row = { id: string; name: string; score: number };

const columns: readonly DataTableColumn<Row>[] = [
  { accessorKey: "name", header: "Name", meta: { pin: "left", title: "Name" }, size: 160 },
  {
    accessorKey: "score",
    header: "Score",
    meta: { align: "end", sortField: "ranking", title: "Score" },
    size: 100,
    sortDescFirst: true,
  },
];

function Table({ onSortingChange = vi.fn() }: { onSortingChange?: (value: unknown) => void }) {
  return (
    <DataTable
      ariaLabel="Sortable rows"
      columns={columns}
      id="header-unit-table"
      onSortingChange={onSortingChange}
      rows={[
        { id: "a", name: "Alpha", score: 2 },
        { id: "b", name: "Beta", score: 1 },
      ]}
      sorting={null}
    />
  );
}

describe("DataTableHeader", () => {
  it("layers an opaque table surface below the transparent sticky header", () => {
    render(<Table />);
    const headerGroup = screen.getAllByRole("rowgroup")[0];
    const headerRow = screen.getAllByRole("row")[0];
    const pinnedHeader = headerGroup?.querySelector('[data-column-id="name"]');

    expect(headerGroup).toHaveClass("sticky", "bg-bg-elev");
    expect(headerRow).toHaveClass("bg-table-header-bg", "font-semibold");
    expect(pinnedHeader).toHaveStyle({ backgroundColor: "var(--bg-elev)" });
    expect(pinnedHeader).toHaveClass(
      "group-data-[scrolled=true]/table:shadow-[1px_0_0_var(--border)]",
    );
  });

  it("cycles descending-first sort through descending, ascending and default", () => {
    const onSortingChange = vi.fn();
    const { rerender } = render(<Table onSortingChange={onSortingChange} />);
    const score = screen.getByRole("button", { name: "Sort Score descending" });

    fireEvent.click(score);
    expect(onSortingChange).toHaveBeenLastCalledWith({ direction: "desc", field: "ranking" });
    rerender(
      <DataTable
        ariaLabel="Sortable rows"
        columns={columns}
        id="header-unit-table"
        onSortingChange={onSortingChange}
        rows={[{ id: "a", name: "Alpha", score: 2 }]}
        sorting={{ direction: "desc", field: "ranking" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort Score ascending" }));
    expect(onSortingChange).toHaveBeenLastCalledWith({ direction: "asc", field: "ranking" });
    rerender(
      <DataTable
        ariaLabel="Sortable rows"
        columns={columns}
        id="header-unit-table"
        onSortingChange={onSortingChange}
        rows={[{ id: "a", name: "Alpha", score: 2 }]}
        sorting={{ direction: "asc", field: "ranking" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear Score sorting" }));
    expect(onSortingChange).toHaveBeenLastCalledWith(null);
  });

  it("resizes from the keyboard, restores on Escape and resets on double click", () => {
    render(<Table />);
    const root = screen.getByTestId("header-unit-table");
    const handle = screen.getByRole("separator", { name: "Resize Score column" });

    expect(root.style.getPropertyValue("--dt-col-score")).toBe("100px");
    fireEvent.focus(handle);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(root.style.getPropertyValue("--dt-col-score")).toBe("108px");
    fireEvent.keyDown(handle, { key: "Escape" });
    expect(root.style.getPropertyValue("--dt-col-score")).toBe("100px");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "Enter" });
    fireEvent.doubleClick(handle);
    expect(root.style.getPropertyValue("--dt-col-score")).toBe("100px");
  });

  it("keeps selection and action cell clicks out of row navigation", () => {
    const onAction = vi.fn();
    const onRowClick = vi.fn();
    const onSelectionChange = vi.fn();
    const interactiveColumns: readonly DataTableColumn<Row>[] = [
      { accessorKey: "name", header: "Name", size: 160 },
      {
        cell: () => (
          <button onClick={onAction} type="button">
            Run action
          </button>
        ),
        header: "Actions",
        id: "actions",
        meta: { lockResize: true },
        size: 80,
      },
    ];
    render(
      <DataTable
        ariaLabel="Interactive rows"
        columns={interactiveColumns}
        id="interactive-unit-table"
        onRowClick={onRowClick}
        onSelectionChange={onSelectionChange}
        onSortingChange={vi.fn()}
        rows={[{ id: "a", name: "Alpha", score: 2 }]}
        selection={new Set()}
        sorting={null}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Select Alpha" });
    fireEvent.click(checkbox.closest('[role="cell"]') as HTMLElement);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Run action" }));

    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["a"]));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
