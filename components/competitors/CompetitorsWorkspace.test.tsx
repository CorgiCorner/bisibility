import { canProjectAction } from "@/lib/auth/capabilities";
import { buildCompetitorMarket } from "@/lib/competitors/competitor-market-model";
import type { CompetitorMarketData, CompetitorsViewModel } from "@/lib/competitors/types";
import type { Role } from "@/lib/generated/prisma/client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompetitorsWorkspace } from "./CompetitorsWorkspace";

vi.mock("@/components/competitors/AddCompetitorDrawer", () => ({
  AddCompetitorDrawer: () => null,
}));
vi.mock("@/components/competitors/HeadToHeadTable", () => ({
  HeadToHeadTable: () => null,
}));
vi.mock("@/components/competitors/ShareOfVoiceCard", () => ({
  ShareOfVoiceCard: () => null,
}));

const marketData = {
  allColumns: [
    { domain: "example.com", kind: "You", label: "example.com" },
    { domain: "example.net", id: "competitor_1", kind: "Managed", label: "Example" },
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
      keyword: "rank tracker",
      ranked: true,
      ranks: { "example.com": 4, "example.net": 6 },
      tags: [],
      volume: 1_000,
    },
  ],
  tags: [],
  trackedKeywordCount: 1,
} satisfies CompetitorMarketData;

describe("CompetitorsWorkspace", () => {
  it("uses the shared empty state without exposing internal managed terminology", () => {
    render(
      <CompetitorsWorkspace
        activeViewId={null}
        canCreate
        canDelete
        canUpdate
        deletableSavedViewIds={[]}
        initialFilter={{ excludedKeywordIds: [], position: "all", tag: null }}
        projectRef="prj_1"
        savedViews={[]}
        view={{
          managedCompetitors: [],
          market: null,
          markets: [],
          projectId: "project_1",
          scope: null,
          suggestions: [],
        }}
      />,
    );

    const heading = screen.getByRole("heading", { level: 3, name: "No competitors yet" });
    expect(heading.parentElement).toHaveClass("rounded-2xl", "border", "bg-bg-elev");
    expect(screen.getByText(/add at least one competitor/i)).toBeInTheDocument();
    expect(screen.queryByText(/managed/i)).not.toBeInTheDocument();
  });

  it("uses the same small button size for export and add competitor", () => {
    const market = buildCompetitorMarket(marketData, {
      excludedKeywordIds: [],
      position: "all",
      tag: null,
    });
    const option = {
      canonicalKey: "country:us",
      checkedKeywordCount: 1,
      cityName: null,
      countryCode: "US",
      device: "desktop",
      engine: "google",
      hl: "en",
      key: market.key,
      keywordCount: 1,
      languageLabel: "English",
      location: "United States",
      locationId: "location_us",
      locationKind: "country",
      regionName: null,
    } as const;
    const view = {
      managedCompetitors: [
        { domain: "example.net", id: "competitor_1", initials: "EN", label: "Example" },
      ],
      market,
      markets: [option],
      projectId: "project_1",
      scope: { device: "desktop", engine: "google", locationId: "location_us" },
      suggestions: [],
    } satisfies CompetitorsViewModel;

    render(
      <CompetitorsWorkspace
        activeViewId={null}
        addKeywordsAction={vi.fn()}
        canCreate
        canDelete
        canUpdate
        deletableSavedViewIds={[]}
        initialFilter={{ excludedKeywordIds: [], position: "all", tag: null }}
        projectRef="prj_1"
        savedViews={[]}
        view={view}
      />,
    );

    expect(screen.getByRole("button", { name: "Export" })).toHaveClass("MuiButton-sizeSmall");
    expect(screen.getByRole("button", { name: "Add competitor" })).toHaveClass(
      "MuiButton-sizeSmall",
    );
  });

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders competitor creation for the %s role at the create threshold",
    (role) => {
      const canCreate = canProjectAction(role, "create", "competitor");
      render(
        <CompetitorsWorkspace
          activeViewId={null}
          canCreate={canCreate}
          canDelete={canProjectAction(role, "delete", "competitor")}
          canUpdate={canProjectAction(role, "update", "competitor")}
          deletableSavedViewIds={[]}
          initialFilter={{ excludedKeywordIds: [], position: "all", tag: null }}
          projectRef="prj_1"
          savedViews={[]}
          view={{
            managedCompetitors: [],
            market: null,
            markets: [],
            projectId: "project_1",
            scope: null,
            suggestions: [],
          }}
        />,
      );

      expect(Boolean(screen.queryByRole("button", { name: "Add competitor" }))).toBe(canCreate);
    },
  );
});
