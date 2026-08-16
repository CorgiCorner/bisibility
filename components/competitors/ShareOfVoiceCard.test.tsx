import { buildCompetitorMarket } from "@/lib/competitors/competitor-market-model";
import type { CompetitorFilter, CompetitorMarketData } from "@/lib/competitors/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  languageLabel: "English",
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
      volume: 1_000,
    },
  ],
  tags: [],
  trackedKeywordCount: 1,
} satisfies CompetitorMarketData;

describe("ShareOfVoiceCard no-data semantics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    expect(
      screen.getByText("Visibility across 1 tracked keyword / United States / English / Desktop"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Google/)).not.toBeInTheDocument();
    expect(screen.queryByText(/US \/ Desktop/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no completed rank checks exist/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it("renders the SOV market contract copy supplied with the selector", () => {
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
        scopeControls={
          <span>SOV compares one market (location + language) + device at a time</span>
        }
      />,
    );

    expect(
      screen.getByText("SOV compares one market (location + language) + device at a time"),
    ).toBeInTheDocument();
  });

  it("does not render a zero-percent SOV chart when every volume is missing", () => {
    const filter: CompetitorFilter = { excludedKeywordIds: [], position: "all", tag: null };
    const missingVolume = {
      ...data,
      observations: [
        { ...data.observations[0], ranked: true, ranks: { "example.com": 2 }, volume: null },
      ],
    } satisfies CompetitorMarketData;
    const market = buildCompetitorMarket(missingVolume, filter);

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

    expect(screen.getByText(/no positive search volume is available/i)).toBeInTheDocument();
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

  it("keeps the application competitor initials behind a domain favicon layer", () => {
    const rankedData = {
      ...data,
      allColumns: [
        { domain: "example.com", kind: "You" as const, label: "example.com" },
        {
          domain: "example.org",
          id: "competitor_1",
          kind: "Managed" as const,
          label: "Example",
        },
      ],
      observations: [
        {
          ...data.observations[0],
          ranked: true,
          ranks: { "example.com": 8, "example.org": 4 },
        },
      ],
    } satisfies CompetitorMarketData;
    const filter: CompetitorFilter = { excludedKeywordIds: [], position: "all", tag: null };
    const market = buildCompetitorMarket(rankedData, filter);
    const { container } = render(
      <ShareOfVoiceCard
        canDelete
        canUpdate
        filter={filter}
        market={market}
        onFilterChange={vi.fn()}
        projectId="project_1"
      />,
    );

    expect(screen.getByText("EO")).toBeInTheDocument();
    const probe = screen.getAllByTestId("competitor-tile-favicon-probe")[1];
    Object.defineProperties(probe, {
      naturalHeight: { configurable: true, value: 64 },
      naturalWidth: { configurable: true, value: 64 },
    });
    fireEvent.load(probe);
    expect(screen.getByTestId("competitor-tile-favicon")).toHaveStyle({
      backgroundImage: 'url("https://www.google.com/s2/favicons?domain=example.org&sz=64")',
      backgroundSize: "cover",
    });
    expect(container.innerHTML).not.toContain("logo.dev");
  });
});
