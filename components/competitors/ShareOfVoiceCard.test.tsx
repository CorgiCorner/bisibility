import { buildCompetitorMarket } from "@/lib/competitors/competitor-market-model";
import type { CompetitorFilter, CompetitorMarketData } from "@/lib/competitors/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShareOfVoiceCard } from "./ShareOfVoiceCard";

vi.mock("./ManagedCompetitorControls", () => ({
  ManagedCompetitorControls: () => null,
}));

const data = {
  allColumns: [
    { domain: "example.com", kind: "You", label: "example.com" },
    {
      domain: "rankzly.io",
      id: "competitor_1",
      kind: "Managed",
      label: "Rankzly",
    },
  ],
  competitorCount: 1,
  device: "desktop",
  engine: "google",
  key: "location_us::desktop::google",
  location: "United States",
  locationId: "location_us",
  locationKind: "country",
  observations: [
    {
      completed: true,
      id: "kw_1",
      keyword: "outside top 100",
      ranked: false,
      ranks: { "example.com": null, "rankzly.io": null },
      tags: [],
    },
  ],
  tags: [],
  trackedKeywordCount: 1,
} satisfies CompetitorMarketData;

describe("ShareOfVoiceCard no-data semantics", () => {
  it("labels completed unranked checks honestly without rendering zero shares", () => {
    const filter: CompetitorFilter = { excludedKeywordIds: [], position: "all", tag: null };
    const market = buildCompetitorMarket(data, filter);

    render(
      <ShareOfVoiceCard
        canDelete
        canUpdate
        filter={filter}
        market={market}
        onFilterChange={vi.fn()}
        projectId="project_1"
      />,
    );

    expect(screen.getByText(/no tracked domain ranked in the top 100/i)).toBeInTheDocument();
    expect(screen.queryByText(/no completed rank checks exist/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it("identifies an active filter that excludes otherwise completed data", () => {
    const rankedData = {
      ...data,
      observations: [
        {
          ...data.observations[0],
          ranked: true,
          ranks: { "example.com": 8, "rankzly.io": 4 },
          tags: ["brand"],
        },
      ],
      tags: ["brand"],
    } satisfies CompetitorMarketData;
    const filter: CompetitorFilter = { excludedKeywordIds: [], position: "all", tag: "other" };
    const market = buildCompetitorMarket(rankedData, filter);

    render(
      <ShareOfVoiceCard
        canDelete
        canUpdate
        filter={filter}
        market={market}
        onFilterChange={vi.fn()}
        projectId="project_1"
      />,
    );

    expect(
      screen.getByText(/no completed rank checks match the current filters/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no completed rank checks exist/i)).not.toBeInTheDocument();
  });

  it("links managed competitor domains to their websites", () => {
    const rankedData = {
      ...data,
      observations: [
        {
          ...data.observations[0],
          ranked: true,
          ranks: { "example.com": 8, "rankzly.io": 4 },
        },
      ],
    } satisfies CompetitorMarketData;
    const filter: CompetitorFilter = { excludedKeywordIds: [], position: "all", tag: null };
    const market = buildCompetitorMarket(rankedData, filter);

    render(
      <ShareOfVoiceCard
        canDelete
        canUpdate
        filter={filter}
        market={market}
        onFilterChange={vi.fn()}
        projectId="project_1"
      />,
    );

    expect(screen.getByRole("link", { name: "rankzly.io" })).toHaveAttribute(
      "href",
      "https://rankzly.io",
    );
    expect(screen.getByRole("link", { name: "rankzly.io" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByRole("link", { name: "rankzly.io" })).toHaveAttribute("target", "_blank");
  });
});
