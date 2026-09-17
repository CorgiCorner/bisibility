import {
  projectRankTrackerFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FiltersDrawer } from "./FiltersDrawer";

describe("FiltersDrawer localization boundary", () => {
  it("maps position, change, status, and SERP IDs to injected copy instead of facet labels", () => {
    const messages = structuredClone(projectRankTrackerFeatureTestMessages);
    const filters = messages.projectRankTracker.keywordImport.management.filters;
    filters.filterPositionTop3 = "Pierwsza trójka";
    filters.filterChangeAny = "Dowolna zmiana";
    filters.filterLastCheckFailed = "Nieudane";
    filters.filterSerpFeatured = "Polecany fragment";

    renderWithFeatureMessages(
      <FiltersDrawer
        basePath="/app/prj_abcdefghijklmnopqrstuvwx/rank-tracker"
        facets={{
          intents: [],
          positions: [
            { count: 3, id: "top3", label: "legacy English position label" },
            { count: 0, id: "top10", label: "legacy English position label" },
            { count: 0, id: "11-50", label: "legacy English position label" },
            { count: 0, id: "51-100", label: "legacy English position label" },
          ],
          tags: [],
          topics: [],
        }}
        filters={{ ...emptyKeywordFilters, lastCheck: "failed" }}
        onChange={vi.fn()}
        onClose={vi.fn()}
        open
        rows={[]}
      />,
      { locale: "pl", messages },
    );

    expect(screen.getByRole("button", { name: "Pierwsza trójka3" })).toHaveTextContent("3");
    expect(screen.getByRole("radio", { name: "Dowolna zmiana" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Nieudane" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Polecany fragment/ })).toBeInTheDocument();
    expect(screen.queryByText("legacy English position label")).not.toBeInTheDocument();
  });
});
