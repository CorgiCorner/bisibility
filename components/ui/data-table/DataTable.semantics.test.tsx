import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";
import type { DataTableColumn, DataTableColumnPinning } from "./data-table-types";

type Row = { id: string; label: string; score: number };

const rows: readonly Row[] = [{ id: "a", label: "Alpha", score: 1 }];
const onSortingChange = vi.fn();

function Table({
  columnPinning,
  columns,
}: Readonly<{
  columnPinning?: DataTableColumnPinning;
  columns: readonly DataTableColumn<Row>[];
}>) {
  return (
    <DataTable
      ariaLabel="Semantic updates"
      columnPinning={columnPinning}
      columns={columns}
      id="semantic-updates"
      onSortingChange={onSortingChange}
      rows={rows}
      sorting={null}
    />
  );
}

describe("DataTable semantic updates", () => {
  it("refreshes a cell when only its column renderer changes", () => {
    const columns: readonly [DataTableColumn<Row>] = [
      { accessorKey: "label", cell: () => "Before", header: "Label" },
    ];
    const view = render(<Table columns={columns} />);
    expect(screen.getByText("Before")).toBeInTheDocument();

    view.rerender(<Table columns={[{ ...columns[0], cell: () => "After" }]} />);

    expect(screen.getByText("After")).toBeInTheDocument();
  });

  it("uses the latest callback from a changed cell definition", () => {
    const before = vi.fn();
    const after = vi.fn();
    const columns = (callback: () => void): readonly DataTableColumn<Row>[] => [
      {
        accessorKey: "label",
        cell: () => (
          <button onClick={callback} type="button">
            Run cell action
          </button>
        ),
        header: "Label",
      },
    ];
    const view = render(<Table columns={columns(before)} />);

    view.rerender(<Table columns={columns(after)} />);
    fireEvent.click(screen.getByRole("button", { name: "Run cell action" }));

    expect(after).toHaveBeenCalledOnce();
    expect(before).not.toHaveBeenCalled();
  });

  it("keeps body and header pinning aligned when controlled pinning changes", () => {
    const columns: readonly DataTableColumn<Row>[] = [
      { accessorKey: "label", header: "Label", size: 160 },
      { accessorKey: "score", header: "Score", size: 100 },
    ];
    const view = render(
      <Table columnPinning={{ left: ["label"], right: ["score"] }} columns={columns} />,
    );
    const root = screen.getByTestId("semantic-updates");
    const header = (id: string) =>
      root.querySelector<HTMLElement>(`[role="columnheader"][data-column-id="${id}"]`);
    const cell = (id: string) =>
      root.querySelector<HTMLElement>(`[role="cell"][data-column-id="${id}"]`);

    expect(header("label")).toHaveAttribute("data-pin-edge", "left");
    expect(cell("label")).toHaveAttribute("data-pin-edge", "left");
    expect(header("score")).toHaveAttribute("data-pin-edge", "right");
    expect(cell("score")).toHaveAttribute("data-pin-edge", "right");

    view.rerender(
      <Table columnPinning={{ left: ["score"], right: ["label"] }} columns={columns} />,
    );

    expect(header("label")).toHaveAttribute("data-pin-edge", "right");
    expect(cell("label")).toHaveAttribute("data-pin-edge", "right");
    expect(header("score")).toHaveAttribute("data-pin-edge", "left");
    expect(cell("score")).toHaveAttribute("data-pin-edge", "left");
  });

  it("refreshes visible cells when distinct ID lists share joined text", () => {
    const columns: readonly DataTableColumn<Row>[] = [
      { accessorKey: "label", header: "A", id: "a" },
      { accessorKey: "label", header: "A pipe B", id: "a|b" },
      { accessorKey: "score", header: "C", id: "c" },
      { accessorKey: "score", header: "B pipe C", id: "b|c" },
    ];
    const initialVisibility = { a: true, "a|b": false, "b|c": true, c: false };
    const view = render(
      <DataTable
        ariaLabel="Visible column updates"
        columns={columns}
        columnVisibility={initialVisibility}
        id="visible-column-updates"
        onSortingChange={onSortingChange}
        rows={rows}
        sorting={null}
      />,
    );
    const body = screen.getByTestId("visible-column-updates-body");
    const cellIds = () =>
      [...body.querySelectorAll<HTMLElement>('[role="cell"]')].map(
        (cellElement) => cellElement.dataset.columnId,
      );
    expect(cellIds()).toEqual(["a", "b|c"]);

    view.rerender(
      <DataTable
        ariaLabel="Visible column updates"
        columns={columns}
        columnVisibility={{ a: false, "a|b": true, "b|c": false, c: true }}
        id="visible-column-updates"
        onSortingChange={onSortingChange}
        rows={rows}
        sorting={null}
      />,
    );

    expect(cellIds()).toEqual(["a|b", "c"]);
  });
});
