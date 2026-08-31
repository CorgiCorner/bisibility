import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordsGridFilterDrawer } from "./KeywordsGridFilterOverlays";

vi.mock("./KeywordsGridOverlays", () => ({
  FiltersDrawer: ({ open }: { open: boolean }) => (
    <div data-testid="filters-drawer" data-open={String(open)} hidden={!open} />
  ),
}));

const props = {
  activeViewId: null,
  filters: emptyKeywordFilters,
  keywordsPath: "/app/project/rank-tracker",
  lens: { device: "desktop" as const, locationId: null },
  locationOptions: [],
  onChange: vi.fn(),
  onClose: vi.fn(),
  open: false,
  rows: [],
};

describe("KeywordsGridFilterDrawer", () => {
  it("forwards the closed state to the filters drawer", () => {
    render(<KeywordsGridFilterDrawer {...props} />);

    expect(screen.getByTestId("filters-drawer")).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId("filters-drawer")).not.toBeVisible();
  });

  it("forwards the open state after a visibility change", () => {
    const { rerender } = render(<KeywordsGridFilterDrawer {...props} />);

    rerender(<KeywordsGridFilterDrawer {...props} open />);

    expect(screen.getByTestId("filters-drawer")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("filters-drawer")).toBeVisible();
  });
});
