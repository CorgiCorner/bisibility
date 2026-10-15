import { renderWithSearchInsightsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { FIRST_VIEW_ROWS } from "@/lib/search-insights/constants";
import { stubResizeObserver } from "@/tests/observers";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SearchInsightsBodyLoading,
  SearchInsightsPageLoading,
} from "./SearchInsightsLoadingSkeletons";

beforeEach(stubResizeObserver);

describe("SearchInsightsBodyLoading", () => {
  it("reserves the geometry the tables arrive into rather than a copy of it", () => {
    const { container } = render(
      <SearchInsightsBodyLoading ariaLabel="Search Console data loading" />,
    );

    const tables = container.querySelectorAll("[role=table]");
    expect(tables).toHaveLength(2);
    for (const table of tables) {
      expect(table.querySelectorAll("[role=columnheader]")).toHaveLength(6);
      expect(table.querySelectorAll("[role=row][data-depth]")).toHaveLength(FIRST_VIEW_ROWS);
    }
    expect(container.querySelectorAll("button:not(:disabled)")).toHaveLength(0);
  });

  it("tells assistive technology the page is loading rather than empty", () => {
    const { container } = render(
      <SearchInsightsBodyLoading ariaLabel="Search Console data loading" />,
    );

    const region = container.querySelector("[aria-busy='true']");
    expect(region).toHaveAttribute("aria-label", "Search Console data loading");
  });

  it("keeps the page loading region in the accessibility tree", () => {
    render(
      <SearchInsightsPageLoading
        bodyAriaLabel="Search Console data loading"
        pageAriaLabel="Search Console page loading"
      />,
    );

    const region = screen.getByRole("region", { name: "Search Console page loading" });
    expect(region.closest("[aria-hidden='true']")).toBeNull();
  });
});
