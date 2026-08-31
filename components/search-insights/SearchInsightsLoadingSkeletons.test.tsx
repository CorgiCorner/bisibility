import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SearchInsightsBodyLoading,
  SearchInsightsPageLoading,
} from "./SearchInsightsLoadingSkeletons";
import { moduleTableColumns } from "./search-insights-table-columns";

// Six rows in each of the two table cards, which is what the design reserves.
const SKELETON_ROWS = 12;

describe("SearchInsightsBodyLoading", () => {
  it("reserves the geometry the tables arrive into rather than a copy of it", () => {
    const { container } = render(<SearchInsightsBodyLoading />);

    const reserved = [...container.querySelectorAll("div")].filter((node) =>
      node.className.includes(moduleTableColumns.queries),
    );

    expect(reserved).toHaveLength(SKELETON_ROWS);
  });

  it("tells assistive technology the page is loading rather than empty", () => {
    const { container } = render(<SearchInsightsBodyLoading />);

    const region = container.querySelector("[aria-busy='true']");
    expect(region).toHaveAttribute("aria-label", "Search Console data loading");
  });

  it("keeps the page loading region in the accessibility tree", () => {
    render(<SearchInsightsPageLoading />);

    const region = screen.getByRole("region", { name: "Search Console page loading" });
    expect(region.closest("[aria-hidden='true']")).toBeNull();
  });
});
