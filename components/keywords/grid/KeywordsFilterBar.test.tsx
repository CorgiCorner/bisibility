import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordsFilterBar } from "./KeywordsFilterBar";

describe("KeywordsFilterBar", () => {
  it("uses the shared select-sized toolbar treatment for keyword search", () => {
    render(
      <KeywordsFilterBar
        columnVisibilityModel={{}}
        density="standard"
        filterChips={[]}
        filterCount={0}
        onClearFilters={vi.fn()}
        onColumnVisibilityChange={vi.fn()}
        onDensityChange={vi.fn()}
        onOpenExport={vi.fn()}
        onOpenFilters={vi.fn()}
        onRemoveFilter={vi.fn()}
        onSearchChange={vi.fn()}
        searchValue=""
      />,
    );

    expect(screen.getByRole("textbox", { name: "Filter keywords" }).closest("label")).toHaveClass(
      "min-h-[34px]",
      "bg-transparent",
      "text-[12.5px]",
      "font-medium",
    );
  });
});
