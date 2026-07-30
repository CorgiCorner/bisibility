import { render, screen } from "@testing-library/react";
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
  it("exposes the selected density as a pressed button", () => {
    render(<KeywordsToolbarActions {...props} density="compact" />);

    expect(screen.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Standard" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
