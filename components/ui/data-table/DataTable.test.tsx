import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "./DataTable";
import { dataTableColumnWidthVariable } from "./data-table-sizing";
import { type TestDataTableRow, testDataTableRows } from "./data-table-test-fixtures";
import type { DataTableColumn } from "./data-table-types";

const columns: readonly DataTableColumn<TestDataTableRow>[] = [
  {
    accessorKey: "label",
    header: "Label",
    meta: { flex: 1, pin: "left", title: "Label" },
    minSize: 160,
    size: 180,
  },
  {
    accessorKey: "score",
    header: "Score",
    meta: { align: "end", title: "Score" },
    size: 100,
  },
];

afterEach(() => vi.restoreAllMocks());

function renderTable(
  overrides: Partial<React.ComponentProps<typeof DataTable<TestDataTableRow>>> = {},
) {
  const props: React.ComponentProps<typeof DataTable<TestDataTableRow>> = {
    ariaLabel: "Example rows",
    columns,
    id: "unit-table",
    onSortingChange: vi.fn(),
    renderSection: (row) => row.label,
    rows: testDataTableRows,
    sorting: null,
    ...overrides,
  };
  return { ...render(<DataTable {...props} />), props };
}

describe("DataTable", () => {
  it("renders accessible mixed rows and toggles groups without hiding section children", () => {
    renderTable();

    const table = screen.getByRole("table", { name: "Example rows" });
    expect(table).toHaveAttribute("aria-colcount", "2");
    expect(screen.getByText("Section leaf")).toBeInTheDocument();
    expect(screen.queryByText("Group leaf A")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("row", { name: /Group 5/ }));

    expect(screen.getByText("Group leaf A")).toBeInTheDocument();
    expect(screen.getByText("Group leaf B")).toBeInTheDocument();
    expect(screen.getByText("Group leaf A").closest('[role="row"]')).toHaveAttribute(
      "data-depth",
      "1",
    );
  });

  it("selects the selectable leaves represented by a group checkbox", () => {
    const onSelectionChange = vi.fn();
    renderTable({ onSelectionChange, selection: new Set<string>() });

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Group" }));

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect([...onSelectionChange.mock.calls[0][0]].sort()).toEqual([
      "group-leaf-a",
      "group-leaf-b",
    ]);
  });

  it("clamps one-based pagination and emits the authoritative page shape", () => {
    const onPaginationChange = vi.fn();
    renderTable({
      onPaginationChange,
      pagination: { page: 9, pageSize: 2, pageSizeOptions: [2, 4], rowCount: 5 },
    });

    expect(screen.getByText("5-5 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPaginationChange).toHaveBeenCalledWith({ page: 2, pageSize: 2 });

    fireEvent.click(screen.getByRole("button", { name: "Rows per page" }));
    fireEvent.click(within(screen.getByRole("menu")).getByText("4"));
    expect(onPaginationChange).toHaveBeenCalledWith({ page: 1, pageSize: 4 });
  });

  it("does not paginate client rows when pagination is null", () => {
    const rows = Array.from({ length: 15 }, (_, index) => ({
      id: `row-${index}`,
      label: `Row ${index}`,
      score: index,
    }));
    renderTable({ pagination: null, paginationMode: "client", rows });

    expect(screen.getByText("Row 14")).toBeInTheDocument();
    expect(screen.queryByTestId("data-table-footer")).not.toBeInTheDocument();
  });

  it("clamps client pagination against client rows instead of a supplied server count", () => {
    const rows = [
      { id: "row-a", label: "Row A", score: 1 },
      { id: "row-b", label: "Row B", score: 2 },
      { id: "row-c", label: "Row C", score: 3 },
    ];
    renderTable({
      pagination: { page: 9, pageSize: 2, pageSizeOptions: [2], rowCount: 100 },
      paginationMode: "client",
      rows,
    });

    expect(screen.getByText("Row C")).toBeInTheDocument();
    expect(screen.getByText("3-3 of 3")).toBeInTheDocument();
  });

  it("sorts client rows stably", () => {
    const rows = [
      { id: "first-two", label: "First two", score: 2 },
      { id: "one", label: "One", score: 1 },
      { id: "second-two", label: "Second two", score: 2 },
    ];
    renderTable({
      rows,
      sorting: { direction: "asc", field: "score" },
      sortingMode: "client",
    });

    const bodyRows = within(screen.getByTestId("unit-table-body")).getAllByRole("row");
    expect(bodyRows.map((row) => row.textContent)).toEqual(["One1", "First two2", "Second two2"]);
  });

  it("keeps body cells mounted while root width and pin offsets update during resize", () => {
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    const renderCell = vi.fn((value: unknown) => String(value));
    const resizeColumns: readonly DataTableColumn<TestDataTableRow>[] = [
      {
        accessorKey: "label",
        cell: ({ getValue }) => renderCell(getValue()),
        header: "First",
        id: "first",
        meta: { pin: "left" },
        size: 80,
      },
      {
        accessorKey: "score",
        cell: ({ getValue }) => renderCell(getValue()),
        header: "Second",
        id: "second",
        meta: { flex: 1, pin: "left" },
        size: 100,
      },
      { accessorKey: "label", header: "Middle", id: "middle", size: 140 },
      {
        accessorKey: "score",
        header: "Actions",
        id: "actions",
        meta: { lockResize: true, pin: "right" },
        size: 60,
      },
    ];
    const onColumnSizingChange = vi.fn();
    const view = renderTable({
      columns: resizeColumns,
      onColumnSizingChange,
      pagination: { page: 1, pageSize: 10, pageSizeOptions: [10], rowCount: 999 },
      paginationMode: "client",
      rows: [testDataTableRows[2]],
      sorting: { direction: "asc", field: "second" },
      sortingMode: "client",
    });
    const root = screen.getByTestId("unit-table");
    const handle = screen.getByRole("separator", { name: "Resize First column" });
    const rendersBeforeResize = renderCell.mock.calls.length;

    expect(root.style.getPropertyValue("--dt-table-width")).toBe("500px");
    expect(root.style.getPropertyValue("--dt-pin-first")).toBe("0px");
    expect(root.style.getPropertyValue("--dt-pin-second")).toBe("80px");
    expect(root.style.getPropertyValue("--dt-pin-actions")).toBe("0px");
    const firstCell = root.querySelector<HTMLElement>('[role="cell"][data-column-id="first"]');
    expect(firstCell?.style.getPropertyValue("--dt-pin-first")).toBe("");
    expect(firstCell).toHaveStyle({ left: "var(--dt-pin-first)" });
    expect(firstCell?.closest('[role="row"]')).toHaveStyle({ width: "var(--dt-table-width)" });

    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 132 });

    expect(onColumnSizingChange).toHaveBeenLastCalledWith(expect.objectContaining({ first: 112 }));
    expect(root.style.getPropertyValue("--dt-col-first")).toBe("112px");
    expect(root.style.getPropertyValue("--dt-pin-second")).toBe("112px");
    expect(renderCell).toHaveBeenCalledTimes(rendersBeforeResize);

    root.scrollLeft = 24;
    fireEvent.scroll(root);
    expect(root).toHaveAttribute("data-scrolled", "true");

    fireEvent.mouseUp(document, { clientX: 132 });
    view.rerender(
      <DataTable
        ariaLabel="Example rows"
        columns={resizeColumns}
        id="unit-table"
        onSortingChange={vi.fn()}
        rows={[{ ...testDataTableRows[2], label: "Updated standalone" }]}
        sorting={null}
      />,
    );
    expect(screen.getAllByText("Updated standalone").length).toBeGreaterThan(0);
    expect(renderCell.mock.calls.length).toBeGreaterThan(rendersBeforeResize);
    clientWidth.mockRestore();
  });

  it("keeps special-character column variables and group controls distinct", () => {
    const colonVariable = dataTableColumnWidthVariable("a:b");
    const underscoreVariable = dataTableColumnWidthVariable("a_b");
    expect(colonVariable).not.toBe(underscoreVariable);

    const specialColumns: readonly DataTableColumn<TestDataTableRow>[] = [
      { accessorKey: "label", header: "Colon", id: "a:b", size: 80 },
      { accessorKey: "score", header: "Underscore", id: "a_b", size: 120 },
    ];
    const rows: readonly TestDataTableRow[] = [
      {
        id: "group:a",
        kind: "group",
        label: "Colon group",
        score: 1,
        subRows: [{ id: "colon-child", label: "Colon child", score: 1 }],
      },
      {
        id: "group_a",
        kind: "group",
        label: "Underscore group",
        score: 2,
        subRows: [{ id: "underscore-child", label: "Underscore child", score: 2 }],
      },
    ];
    renderTable({ columns: specialColumns, rows });
    const root = screen.getByTestId("unit-table");
    expect(root.style.getPropertyValue(colonVariable)).toBe("80px");
    expect(root.style.getPropertyValue(underscoreVariable)).toBe("120px");

    const colonToggle = screen.getByRole("button", { name: "Expand Colon group" });
    const underscoreToggle = screen.getByRole("button", { name: "Expand Underscore group" });
    expect(colonToggle.getAttribute("aria-controls")).not.toBe(
      underscoreToggle.getAttribute("aria-controls"),
    );
    fireEvent.click(colonToggle);
    fireEvent.click(underscoreToggle);
    expect(document.getElementById(colonToggle.getAttribute("aria-controls") ?? "")).not.toBeNull();
    expect(
      document.getElementById(underscoreToggle.getAttribute("aria-controls") ?? ""),
    ).not.toBeNull();
  });

  it("virtualizes fill rows from below the sticky header through the final record", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `virtual-${index}`,
      label: `Virtual row ${index}`,
      score: index,
    }));
    renderTable({ layout: "fill", rows });
    const root = screen.getByTestId("unit-table");
    const body = screen.getByTestId("unit-table-body");

    expect(screen.getByText("Virtual row 0")).toBeInTheDocument();
    expect(screen.queryByText("Virtual row 99")).not.toBeInTheDocument();
    expect(body.childElementCount).toBe(11);
    expect(body).toHaveStyle({ minWidth: "var(--dt-table-width)" });

    root.scrollTop = 6_642;
    fireEvent.scroll(root);

    const last = screen.getByText("Virtual row 99").closest('[role="row"]');
    expect(last).toHaveStyle({ height: "68px", transform: "translateY(6732px)" });
    expect(body).toHaveStyle({ height: "6800px" });
  });
  it("keeps the responsive footer viewport-bound and hover groups row-local", () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(200);
    renderTable({
      footerStart: "Summary",
      layout: "fill",
      pagination: { page: 1, pageSize: 2, pageSizeOptions: [2], rowCount: 5 },
    });
    const root = screen.getByTestId("unit-table");
    const footer = screen.getByTestId("data-table-footer");
    const row = screen.getByText("Standalone").closest('[role="row"]');
    expect(root).toHaveClass("group/table", "flex");
    expect(root).not.toHaveClass("group");
    expect(footer.parentElement).toBe(root);
    expect(footer).toHaveClass("sticky", "left-0", "bottom-0", "mt-auto", "w-full", "flex-wrap");
    expect(footer.lastElementChild).toHaveClass("flex-wrap");
    expect(row).toHaveClass("group");
  });
});
