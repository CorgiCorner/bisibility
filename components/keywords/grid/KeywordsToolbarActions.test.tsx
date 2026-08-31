import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("splits compact and labeled transfer actions at the xl breakpoint", () => {
    render(<KeywordsToolbarActions {...props} density="compact" onImportCsv={vi.fn()} />);

    for (const [action, label] of [
      ["export", "Export"],
      ["import", "Import"],
    ] as const) {
      const compact = screen.getByTestId(`keywords-${action}-compact-action`);
      const labeled = screen.getByTestId(`keywords-${action}-labeled-action`);
      expect(compact).toHaveClass("lg:inline-flex", "xl:hidden");
      expect(labeled).toHaveClass("xl:inline-flex");
      expect(within(compact).getByRole("button")).toHaveAccessibleName(label);
      expect(within(labeled).getByRole("button")).toHaveAccessibleName(label);
    }
  });

  it("gives compact transfer icons accessible tooltip labels", () => {
    render(<KeywordsToolbarActions {...props} density="compact" onImportCsv={vi.fn()} />);

    for (const [action, label] of [
      ["export", "Export"],
      ["import", "Import"],
    ] as const) {
      const compactAction = within(
        screen.getByTestId(`keywords-${action}-compact-action`),
      ).getByRole("button");
      expect(compactAction).not.toHaveTextContent(action);
      expect(compactAction.querySelectorAll("svg")).toHaveLength(1);
      expect(compactAction.closest('[data-toolbar-tooltip="true"]')).toHaveAttribute(
        "data-tooltip-label",
        label,
      );
    }
  });

  it("keeps labeled transfer actions for xl desktop", () => {
    render(<KeywordsToolbarActions {...props} density="compact" onImportCsv={vi.fn()} />);

    for (const [action, label] of [
      ["export", "Export"],
      ["import", "Import"],
    ] as const) {
      const desktopAction = within(
        screen.getByTestId(`keywords-${action}-labeled-action`),
      ).getByRole("button");
      expect(desktopAction).toHaveTextContent(label);
      expect(desktopAction.querySelectorAll("svg")).toHaveLength(1);
    }
  });
});
