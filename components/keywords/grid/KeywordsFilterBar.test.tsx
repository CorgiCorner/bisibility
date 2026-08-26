import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordsFilterBar } from "./KeywordsFilterBar";

const baseProps = {
  columnVisibilityModel: {},
  density: "standard" as const,
  filterChips: [],
  filterCount: 0,
  onClearFilters: vi.fn(),
  onColumnVisibilityChange: vi.fn(),
  onDensityChange: vi.fn(),
  onOpenExport: vi.fn(),
  onOpenFilters: vi.fn(),
  onRefresh: vi.fn(),
  onRemoveFilter: vi.fn(),
  onSearchChange: vi.fn(),
  searchValue: "",
};

describe("KeywordsFilterBar", () => {
  it("renders the search via shared ToolbarSearch (type=search, toolbar control surface)", () => {
    render(<KeywordsFilterBar {...baseProps} />);

    const input = screen.getByRole("searchbox", { name: "Search keywords" });
    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveAttribute("id", "keywords-filter");
    expect(input).toHaveAttribute("placeholder", "Search keywords...");

    const label = input.closest("label");
    expect(label).toHaveClass(
      "min-h-[34px]",
      "rounded-control",
      "border",
      "border-border-control",
      "bg-transparent",
      "text-[12.5px]",
      "font-normal",
    );
  });

  it("calls onSearchChange with the new value when the search input changes", () => {
    const onSearchChange = vi.fn();
    render(<KeywordsFilterBar {...baseProps} onSearchChange={onSearchChange} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search keywords" }), {
      target: { value: "rank" },
    });
    expect(onSearchChange).toHaveBeenCalledWith("rank");
  });

  it("does not render the xl vertical divider", () => {
    const { container } = render(<KeywordsFilterBar {...baseProps} />);

    const dividers = container.querySelectorAll(".w-px.bg-border");
    expect(dividers).toHaveLength(0);
  });

  it("omits the desktop context row when no optional controls are present", () => {
    const { container } = render(<KeywordsFilterBar {...baseProps} />);

    expect(container.querySelector("[data-keywords-toolbar-context]")).not.toBeInTheDocument();
  });

  it("keeps scope, grouping, and saved views in one flex row from sm", () => {
    const { container } = render(
      <KeywordsFilterBar
        {...baseProps}
        groupingControl={<span>Grouped</span>}
        savedViewControl={<span>All keywords</span>}
        scopeControl={<span>All locations</span>}
      />,
    );

    const row = container.querySelector("[data-keywords-toolbar-context]");
    expect(row).toHaveClass("order-2", "flex-row", "flex-nowrap", "items-center", "lg:order-1");
    expect(row).not.toHaveClass("contents");
  });

  it("refreshes the table from the context row", () => {
    const onRefresh = vi.fn();
    render(
      <KeywordsFilterBar
        {...baseProps}
        groupingControl={<span>Grouped</span>}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh table" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("applies the wider xl search grid template (min 320px)", () => {
    render(<KeywordsFilterBar {...baseProps} />);

    const label = screen.getByRole("searchbox", { name: "Search keywords" }).closest("label");
    const grid = label?.parentElement;
    expect(grid).toHaveClass("xl:grid-cols-[minmax(320px,1fr)_auto]");
    expect(grid).toHaveClass("lg:grid-cols-[minmax(220px,1fr)_auto]");
  });

  it("renders filter chips and clear-all, and calls onClearFilters", () => {
    const onClearFilters = vi.fn();
    render(
      <KeywordsFilterBar
        {...baseProps}
        filterChips={[
          { key: "change", label: "Change: Improved" },
          { key: "lastCheck", label: "Last check: Failed" },
        ]}
        filterCount={2}
        onClearFilters={onClearFilters}
        searchValue="rank"
      />,
    );

    expect(screen.getByText("Change: Improved")).toBeInTheDocument();
    expect(screen.getByText("Last check: Failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all search and filters" }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it("calls onRemoveFilter with the chip key when a filter chip is clicked", () => {
    const onRemoveFilter = vi.fn();
    render(
      <KeywordsFilterBar
        {...baseProps}
        filterChips={[{ key: "change", label: "Change: Improved" }]}
        filterCount={1}
        onRemoveFilter={onRemoveFilter}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Change: Improved" }));
    expect(onRemoveFilter).toHaveBeenCalledWith("change");
  });

  it("hides the chips row on sm+ when only the scope chip is present", () => {
    render(
      <KeywordsFilterBar
        {...baseProps}
        scopeChip={<span data-testid="scope-chip">Scope: example.com</span>}
      />,
    );

    const chipsRow = screen.getByTestId("scope-chip").parentElement;
    expect(chipsRow).toHaveClass("lg:hidden");
  });

  it("does not hide the chips row when filters are also active alongside the scope chip", () => {
    render(
      <KeywordsFilterBar
        {...baseProps}
        filterChips={[{ key: "change", label: "Change: Improved" }]}
        filterCount={1}
        scopeChip={<span data-testid="scope-chip">Scope: example.com</span>}
      />,
    );

    const chipsRow = screen.getByTestId("scope-chip").parentElement;
    expect(chipsRow).not.toHaveClass("lg:hidden");
  });
});
