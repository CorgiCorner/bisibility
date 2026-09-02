import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordsToolbarActions } from "./KeywordsToolbarActions";

const mocks = vi.hoisted(() => ({ useMediaQuery: vi.fn() }));
vi.mock("@mui/material/useMediaQuery", () => ({ default: mocks.useMediaQuery }));

const props = {
  columnVisibilityModel: {},
  filterCount: 0,
  onColumnVisibilityChange: vi.fn(),
  onDensityChange: vi.fn(),
  onOpenExport: vi.fn(),
  onOpenFilters: vi.fn(),
};

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

  it("matches the labeled secondary toolbar typography contract", () => {
    render(<KeywordsToolbarActions {...props} density="compact" />);

    const columns = screen.getByRole("button", { name: "Columns" });
    const style = getComputedStyle(columns);
    expect(style.color).toBe("var(--fg)");
    expect(style.fontSize).toBe("12.5px");
    expect(style.fontWeight).toBe("400");
  });

  it("keeps toolbar action icons on the button foreground color contract", () => {
    render(
      <KeywordsToolbarActions
        {...props}
        density="compact"
        filterCount={1}
        onAddKeyword={vi.fn()}
        onImportCsv={vi.fn()}
      />,
    );

    for (const label of [
      "Columns",
      "Filters",
      "Import or export",
      "Export",
      "Import",
      "Add keyword",
    ]) {
      for (const action of screen.getAllByRole("button", { name: label })) {
        const icon = action.querySelector(".MuiButton-startIcon svg");
        expect(icon, `${label} action icon`).toHaveClass("text-current");
        expect(icon, `${label} action icon`).not.toHaveClass("text-accent", "text-accent-text");
      }
    }
  });

  it("renders density as a radiogroup with the active option checked", () => {
    render(<KeywordsToolbarActions {...props} density="compact" />);
    const compact = screen.getByRole("radio", { name: "Compact" });
    const standard = screen.getByRole("radio", { name: "Standard" });
    expect(compact).toBeChecked();
    expect(standard).not.toBeChecked();
    expect(compact).toHaveAttribute("name", standard.getAttribute("name"));
  });

  it("changes density when arrow keys are pressed", () => {
    render(<KeywordsToolbarActions {...props} density="compact" />);
    const compact = screen.getByRole("radio", { name: "Compact" });
    compact.focus();
    fireEvent.keyDown(compact, { key: "ArrowRight" });
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
      const actionContainer = screen.getByTestId(`keywords-${action}-action`);
      expect(actionContainer).toHaveClass("hidden", "lg:inline-flex");

      const button = screen.getByRole("button", { name: label });
      expect(button).toHaveTextContent(label);
      expect(button.querySelectorAll("svg")).toHaveLength(1);
      expect(button).toHaveStyle({ minWidth: 40 });
      expect(button.closest('[data-toolbar-tooltip="true"]')).toHaveAttribute(
        "data-tooltip-label",
        label,
      );
    }
  });
});
