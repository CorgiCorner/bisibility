import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordsToolbarActions } from "./KeywordsToolbarActions";

const mocks = vi.hoisted(() => ({ useMediaQuery: vi.fn() }));
vi.mock("@/lib/ui/use-media-query", () => ({ useMediaQuery: mocks.useMediaQuery }));

const columns: readonly DataTableColumn<KeywordRow>[] = [
  {
    accessorKey: "keyword",
    header: "Keyword",
    meta: { lockVisible: true, title: "Keyword" },
  },
  { accessorKey: "position", header: "Pos", meta: { title: "Position" } },
  { header: "", id: "actions", meta: { lockVisible: true } },
];
const props = {
  columnSizing: {},
  columns,
  columnVisibility: {},
  filterCount: 0,
  id: "toolbar-table",
  onColumnSizingChange: vi.fn(),
  onColumnVisibilityChange: vi.fn(),
  onDensityChange: vi.fn(),
  onOpenExport: vi.fn(),
  onOpenFilters: vi.fn(),
};

function expectCompactWidth(button: HTMLElement) {
  expect(button).toHaveClass("max-xl:min-w-10", "max-xl:gap-0");
}

describe("KeywordsToolbarActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useMediaQuery.mockReturnValue(false);
  });

  it("enables toolbar tooltips only for the mobile media query without noSsr", () => {
    const { rerender } = render(<KeywordsToolbarActions {...props} density="compact" />);
    expect(
      screen.getByRole("button", { name: "Filters" }).closest("[data-toolbar-tooltip]"),
    ).toBeNull();
    const mobileQueryCall = mocks.useMediaQuery.mock.calls.find(
      ([query]) => query === "(max-width:1023px)",
    );
    expect(mobileQueryCall).toEqual(["(max-width:1023px)"]);

    mocks.useMediaQuery.mockImplementation((query: string) => query === "(max-width:1023px)");
    rerender(<KeywordsToolbarActions {...props} density="compact" />);
    expect(
      screen.getByRole("button", { name: "Filters" }).closest("[data-toolbar-tooltip]"),
    ).toBeInTheDocument();
  });

  it("keeps the shared columns menu functional on mobile with locked columns omitted", () => {
    mocks.useMediaQuery.mockReturnValue(true);
    render(<KeywordsToolbarActions {...props} density="compact" />);

    const trigger = screen.getByRole("button", { name: "Columns" });
    expect(trigger.parentElement).not.toHaveClass("hidden");
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: /Position/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Keyword/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Actions/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /Position/ }));
    expect(props.onColumnVisibilityChange).toHaveBeenCalledWith({ position: false });
  });

  it("keeps secondary transfer action icons on the muted foreground contract", () => {
    render(
      <KeywordsToolbarActions
        {...props}
        density="compact"
        filterCount={1}
        onAddKeyword={vi.fn()}
        onImportCsv={vi.fn()}
      />,
    );

    for (const label of ["Import or export", "Export", "Import"]) {
      for (const action of screen.getAllByRole("button", { name: label })) {
        expect(action).toHaveClass("[&_[data-button-start-icon]]:text-fg-muted");
        expect(action.querySelector("[data-button-start-icon] svg")).toHaveClass("text-fg-muted");
      }
    }
    expect(screen.getByRole("button", { name: "Filters" })).toHaveStyle({ color: "var(--fg)" });
    expect(screen.getByRole("button", { name: "Add keyword" })).toBeInTheDocument();
  });

  it("uses the shared density menu and emits its selected value", () => {
    render(<KeywordsToolbarActions {...props} density="compact" />);

    const density = screen.getByRole("button", { name: "Table density" });
    expect(density).toHaveTextContent("Compact");
    fireEvent.click(density);
    fireEvent.click(screen.getByRole("menuitem", { name: "Standard" }));
    expect(props.onDensityChange).toHaveBeenCalledWith("standard");
  });

  it("renders one mobile transfer icon and exposes import and export menu items", () => {
    const onImportCsv = vi.fn();
    render(<KeywordsToolbarActions {...props} density="compact" onImportCsv={onImportCsv} />);
    const transfer = screen.getByRole("button", { name: "Import or export" });
    expect(transfer.querySelectorAll("svg")).toHaveLength(1);
    fireEvent.click(transfer);
    fireEvent.click(screen.getByRole("menuitem", { name: "Export keywords" }));
    expect(props.onOpenExport).toHaveBeenCalledOnce();
    fireEvent.click(transfer);
    fireEvent.click(screen.getByRole("menuitem", { name: "Import keywords" }));
    expect(onImportCsv).toHaveBeenCalledOnce();
  });

  it("renders exactly one accessible desktop action per transfer operation", () => {
    render(<KeywordsToolbarActions {...props} density="compact" onImportCsv={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: "Export" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Import" })).toHaveLength(1);
  });

  it("keeps each transfer action compact below xl and labeled at xl", () => {
    render(<KeywordsToolbarActions {...props} density="compact" onImportCsv={vi.fn()} />);

    for (const [action, label] of [
      ["export", "Export"],
      ["import", "Import"],
    ] as const) {
      expect(screen.getByTestId(`keywords-${action}-action`)).toHaveClass(
        "hidden",
        "lg:inline-flex",
      );
      const button = screen.getByRole("button", { name: label });
      expect(button).toHaveTextContent(label);
      expect(button.querySelectorAll("svg")).toHaveLength(1);
      expectCompactWidth(button);
    }
  });

  it("keeps Add keyword compact below xl like the transfer actions", () => {
    render(<KeywordsToolbarActions {...props} density="compact" onAddKeyword={vi.fn()} />);

    const addKeyword = screen.getByRole("button", { name: "Add keyword" });
    expectCompactWidth(addKeyword);
    expect(addKeyword.closest('[data-toolbar-tooltip="true"]')).toHaveAttribute(
      "data-tooltip-label",
      "Add keyword",
    );
  });
});
