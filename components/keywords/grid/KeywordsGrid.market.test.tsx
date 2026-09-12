import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { asMarketRef } from "@/lib/routing/app-path";
import { setNavigationState } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderPendingGrid } from "./KeywordsGrid.test-helpers";

vi.mock("@/components/keywords/import/ImportCsvWizard", () => ({ ImportCsvWizard: () => null }));

const projectMarkets = {
  markets: [
    {
      canonicalKey: "US",
      countryCode: "US",
      displayName: "United States",
      id: "pmkt_us",
      languageCode: "en",
      languageLabel: "English",
      monthlyCostCents: null,
      researchAvailable: true,
      status: "active",
    },
  ],
  maxMarkets: 5,
  monthlyCostCents: null,
  perMarketChecks: 2,
  projectId: "prj_1",
} satisfies ProjectMarketsView;

const unitedStates = { locationId: "loc_us", ref: asMarketRef("pmkt_us") };
const DEEP_LINK_RUN = "rcr_deeplinkfixture000000";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setNavigationState({ pathname: "/app/prj_1/m/pmkt_us/rank-tracker" });
  stubResizeObserver();
});

describe("KeywordsGrid inside one market", () => {
  it("hides the location lens because the market route owns that scope", () => {
    renderPendingGrid({ projectMarkets, rows: [keywordRows[0]], totalCount: 1 }, unitedStates);

    expect(screen.queryByLabelText("Location scope")).not.toBeInTheDocument();
  });

  it("says the market is empty in its own terms and offers both ways out", () => {
    renderPendingGrid({ projectMarkets, rows: [], totalCount: 0 }, unitedStates);

    expect(
      screen.getByRole("heading", { name: "No keywords in United States / English yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add keywords to United States / English" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Copy keywords from another market" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No keywords yet" })).not.toBeInTheDocument();
  });

  it.each(["active", "paused"] as const)(
    "shows the empty %s market when other markets contain keywords",
    (status) => {
      renderPendingGrid(
        {
          projectMarkets: {
            ...projectMarkets,
            markets: [{ ...projectMarkets.markets[0], status }],
          },
          locations: [
            { count: 10, displayName: "Spain", id: "ES", kind: "country" },
            { count: 0, displayName: "United States", id: "US", kind: "country" },
          ],
          rows: [],
          matchedTargetCount: 0,
          totalCount: 10,
        },
        unitedStates,
      );
      expect(
        screen.getByRole("heading", { name: "No keywords in United States / English yet" }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Add keywords to United States / English" }),
      ).toBeEnabled();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    },
  );

  it("states the deep-linked run's slice as a status row inside the frame", () => {
    renderPendingGrid(
      {
        deepLinkRunId: DEEP_LINK_RUN,
        projectMarkets,
        rows: [keywordRows[0]],
        totalCount: 1,
      },
      unitedStates,
    );

    const row = screen.getByTestId("market-run-slice");
    expect(row).toHaveAttribute("role", "status");
    expect(row).toHaveTextContent("You opened this run inside United States / English.");
    expect(screen.getByRole("link", { name: "View all markets" })).toHaveAttribute(
      "href",
      `/app/prj_1/rank-tracker?run=${DEEP_LINK_RUN}`,
    );
    expect(
      screen.getByRole("button", { name: "Stay in United States / English" }),
    ).toBeInTheDocument();
  });

  it("keeps its project-level copy when the market cannot be named", () => {
    renderPendingGrid({ rows: [], totalCount: 0 }, unitedStates);

    expect(screen.getByRole("heading", { name: "No keywords yet" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /No keywords in/ })).not.toBeInTheDocument();
  });
});

describe("KeywordsGrid at the project level", () => {
  it("shows the project-level empty state", () => {
    renderPendingGrid({ projectMarkets, rows: [], totalCount: 0 });

    expect(screen.getByRole("heading", { name: "No keywords yet" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /No keywords in/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Copy keywords from another market" }),
    ).not.toBeInTheDocument();
  });

  it("states no slice, because a project-level page shows every market", () => {
    renderPendingGrid({
      deepLinkRunId: DEEP_LINK_RUN,
      projectMarkets,
      rows: [keywordRows[0]],
      totalCount: 1,
    });

    expect(screen.queryByTestId("market-run-slice")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View all markets" })).not.toBeInTheDocument();
  });
});

it("explains paused-market preparation while retaining Add keywords", () => {
  renderPendingGrid(
    {
      projectMarkets: {
        ...projectMarkets,
        markets: [{ ...projectMarkets.markets[0], status: "paused" }],
      },
      rows: [],
      totalCount: 0,
    },
    unitedStates,
  );
  expect(screen.getByText(/Rank checks will not start until you resume this market/)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Add keywords to United States / English" }),
  ).toBeEnabled();
});
it("explains market identity before any keywords exist", () => {
  renderPendingGrid({
    projectMarkets: { ...projectMarkets, markets: [] },
    rows: [],
    totalCount: 0,
  });
  expect(screen.getByRole("heading", { name: "Start with your first market" })).toBeVisible();
  expect(
    screen.getByText(/A market is the country, location and language you rank in/),
  ).toBeVisible();
});
