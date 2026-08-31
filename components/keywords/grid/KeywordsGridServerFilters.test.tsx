import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordsGridServerFilters } from "./KeywordsGridServerFilters";

vi.mock("./KeywordsGridFilterOverlays", () => ({
  KeywordsGridFilterDrawer: ({ open }: { open: boolean }) => (
    <div data-testid="filter-drawer" data-open={String(open)} hidden={!open} />
  ),
}));

const props = {
  activeViewId: null,
  draftFilters: emptyKeywordFilters,
  facets: { intents: [], positions: [], tags: [], topics: [] },
  filters: emptyKeywordFilters,
  flatServer: false,
  keywordsPath: "/app/project/rank-tracker",
  lens: { device: "desktop" as const, locationId: null },
  locationOptions: [],
  navigateQuery: vi.fn(),
  onClose: vi.fn(),
  open: false,
  query: {
    filters: emptyKeywordFilters,
    grouped: false,
    lens: { device: "desktop" as const, locationId: null },
    page: 1,
    pageSize: 25 as const,
    savedViewId: null,
    search: "",
    sort: { direction: "asc" as const, field: "position" as const },
  },
  rows: [],
  setDraftFilters: vi.fn(),
  setFilters: vi.fn(),
};

describe("KeywordsGridServerFilters", () => {
  it("keeps the closed drawer mounted so its exit transition can finish", () => {
    render(<KeywordsGridServerFilters {...props} />);

    expect(screen.getByTestId("filter-drawer")).not.toBeVisible();
    expect(screen.getByTestId("filter-drawer")).toHaveAttribute("data-open", "false");
  });

  it("forwards visibility changes without replacing the drawer", () => {
    const { rerender } = render(<KeywordsGridServerFilters {...props} />);
    const drawer = screen.getByTestId("filter-drawer");

    rerender(<KeywordsGridServerFilters {...props} open />);

    expect(screen.getByTestId("filter-drawer")).toBe(drawer);
    expect(drawer).toHaveAttribute("data-open", "true");
    expect(drawer).toBeVisible();
  });
});
