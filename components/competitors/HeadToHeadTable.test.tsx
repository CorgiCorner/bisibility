import {
  buildCompetitorMarket,
  emptyCompetitorFilter,
} from "@/lib/competitors/competitor-market-model";
import type { CompetitorMarketData } from "@/lib/competitors/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeadToHeadTable } from "./HeadToHeadTable";

describe("HeadToHeadTable", () => {
  it("shows You plus top three competitors and expands the remaining columns explicitly", () => {
    const columns = [
      { domain: "example.com", kind: "You" as const, label: "You" },
      ...Array.from({ length: 5 }, (_, index) => ({
        domain: `competitor-${index}.dev`,
        kind: "Managed" as const,
        label: `Competitor ${index}`,
      })),
    ];
    const market = buildCompetitorMarket(
      {
        allColumns: columns,
        competitorCount: 5,
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
            keyword: "rank tracker",
            ranked: true,
            ranks: Object.fromEntries(columns.map((column, index) => [column.domain, index + 1])),
            tags: [],
            volume: 1_000,
          },
        ],
        tags: [],
        trackedKeywordCount: 1,
      } satisfies CompetitorMarketData,
      emptyCompetitorFilter,
    );

    render(<HeadToHeadTable market={market} onExport={vi.fn()} />);

    expect(
      screen.getByText("United States / English / Desktop · 1 shared of 1 tracked"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+2 more" })).toBeInTheDocument();
    expect(screen.queryByText("Competitor 4")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+2 more" }));
    expect(screen.getByText("Competitor 4")).toBeInTheDocument();
  });

  it("renders large markets in bounded pages", () => {
    const column = { domain: "example.com", kind: "You" as const, label: "You" };
    const market = buildCompetitorMarket(
      {
        allColumns: [column],
        competitorCount: 0,
        device: "desktop",
        engine: "google",
        key: "location_us::desktop::google",
        languageLabel: "English",
        location: "United States",
        locationId: "location_us",
        locationKind: "country",
        observations: Array.from({ length: 250 }, (_, index) => ({
          completed: true,
          id: `kw_${index}`,
          keyword: `keyword ${index}`,
          ranked: true,
          ranks: { "example.com": index + 1 },
          tags: [],
          volume: 1_000,
        })),
        tags: [],
        trackedKeywordCount: 250,
      },
      emptyCompetitorFilter,
    );

    render(<HeadToHeadTable market={market} onExport={vi.fn()} />);

    expect(screen.getByText("keyword 99")).toBeInTheDocument();
    expect(screen.queryByText("keyword 100")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
    expect(screen.getByText("keyword 199")).toBeInTheDocument();
    expect(screen.queryByText("keyword 200")).not.toBeInTheDocument();
  });
});
