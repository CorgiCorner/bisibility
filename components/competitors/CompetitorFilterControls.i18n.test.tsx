import { CompetitorFilterControls } from "@/components/competitors/CompetitorFilterControls";
import {
  competitorsFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("CompetitorFilterControls localization boundary", () => {
  it("maps position IDs to injected copy instead of model labels", () => {
    const messages = structuredClone(competitorsFeatureTestMessages);
    const ui = messages.projectCompetitors.ui;
    ui.positionAllKeywords = "Wszystkie frazy";
    ui.positionTop3 = "Pierwsza trójka";
    ui.positionTop10 = "Pierwsza dziesiątka";

    renderWithFeatureMessages(
      <CompetitorFilterControls
        filter={{ excludedKeywordIds: [], position: "all", tag: null }}
        onFilterChange={vi.fn()}
        tags={[]}
      />,
      { locale: "pl", messages },
    );

    expect(screen.getByRole("button", { name: "Wszystkie frazy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pierwsza trójka" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pierwsza dziesiątka" })).toBeInTheDocument();
  });
});
