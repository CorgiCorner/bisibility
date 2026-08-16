import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordsToolbarActions } from "./KeywordsToolbarActions";

const props = {
  columnVisibilityModel: {},
  filterCount: 0,
  onColumnVisibilityChange: vi.fn(),
  onDensityChange: vi.fn(),
  onOpenExport: vi.fn(),
  onOpenFilters: vi.fn(),
};

describe("KeywordsToolbarActions", () => {
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
});
