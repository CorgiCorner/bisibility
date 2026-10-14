import {
  competitorsFeatureTestMessages,
  renderWithFeatureMessages as render,
} from "@/i18n/test-support/render-with-feature-messages";
import {
  buildCompetitorMarket,
  emptyCompetitorFilter,
} from "@/lib/competitors/competitor-market-model";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ShareOfVoiceCard } from "./ShareOfVoiceCard";

vi.mock("./ManagedCompetitorControls", () => ({ ManagedCompetitorControls: () => null }));
it("shows unknown coverage accessibly instead of a zero-percent chart", () => {
  const market = buildCompetitorMarket(
    {
      allColumns: [{ domain: "mine.test", kind: "You", label: "Mine" }],
      competitorCount: 0,
      device: "desktop",
      engine: "google",
      key: "market",
      languageLabel: "English",
      location: "US",
      locationId: "us",
      locationKind: "country",
      observations: [
        {
          id: "kw",
          keyword: "keyword",
          completed: true,
          ranked: true,
          ranks: { "mine.test": 1 },
          tags: [],
          volume: 100,
        },
      ],
      tags: [],
      trackedKeywordCount: 1,
    },
    emptyCompetitorFilter,
  );
  const { container } = render(
    <ShareOfVoiceCard
      canDelete={false}
      canUpdate={false}
      filter={emptyCompetitorFilter}
      market={market}
      onFilterChange={vi.fn()}
      projectId="prj_test"
    />,
    { messages: competitorsFeatureTestMessages },
  );
  expect(screen.getByText(/Current comparison is unavailable/)).toBeInTheDocument();
  expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent("1 unknown");
  expect(container.innerHTML).not.toContain("sharedKeywordsPercent");
});
