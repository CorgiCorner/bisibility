import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RetrievedResultsCard } from "./RetrievedResultsCard";
import { CHECK_ID, entry, fullResults, renderCard } from "./retrieved-results-test-fixtures";

describe("RetrievedResultsCard", () => {
  it("compares managed competitors inside the selected SERP and labels their result rows", () => {
    render(
      <RetrievedResultsCard
        competitors={[
          { publicId: "cmp_rival", domain: "sub0.example.org", label: "Rival" },
          { publicId: "cmp_absent", domain: "absent.test", label: "Absent" },
        ]}
        ownDomain="example.com"
        entries={[entry()]}
        initialResults={fullResults()}
        loadResults={async () => []}
        rankingUrl={null}
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    const table = screen.getByRole("table", { name: "Competitor positions" });
    expect(within(table).getByRole("link", { name: /Rival/ })).toHaveAttribute(
      "href",
      "https://sub0.example.org",
    );
    expect(within(table).getByRole("link", { name: /Rival/ })).toHaveAttribute("target", "_blank");
    expect(within(table).getByRole("row", { name: /Rival/ })).toHaveTextContent("#1");
    expect(within(table).getByRole("row", { name: /Rival/ })).toHaveTextContent("21 above you");
    expect(within(table).getByRole("row", { name: /Absent/ })).toHaveTextContent(
      "Not in saved results",
    );
    expect(
      within(screen.getByRole("region", { name: "Retrieved results" })).getByText("Competitor"),
    ).toBeInTheDocument();
  });

  it("distinguishes the project stop setting from what this check retrieved", () => {
    renderCard([entry()], fullResults());

    expect(
      screen.getByRole("button", {
        name: "Checks may stop at the first tracked-domain match when that project setting is enabled. This card shows what this check kept and which positions it did not retrieve.",
      }),
    ).toBeInTheDocument();
  });

  it("pins the tracked result outside the scroller and states what was not retrieved", () => {
    renderCard([entry()], fullResults());

    expect(screen.getByText("Your result")).toBeInTheDocument();
    // #22 appears in the pinned summary bar and again on the tracked ladder row.
    expect(screen.getAllByText("#22")).toHaveLength(2);
    expect(screen.getByText("Positions 23-100")).toBeInTheDocument();
    expect(screen.getByText("78 not retrieved")).toBeInTheDocument();
    expect(screen.getByText(/never requested and never billed/)).toBeInTheDocument();
  });

  it("opens the ladder with the tracked row below the top instead of at it", () => {
    renderCard([entry()], fullResults());
    const scroller = screen.getByLabelText("Retrieved results");

    // Tracked row is index 21 at 52px per row, less three rows of context and the 46px
    // the summary bar occupies. Asserting "greater than zero" would survive any offset.
    expect(scroller.scrollTop).toBe(21 * 65 - 3 * 65);
  });

  it("derives the retention footer from the injected retention window", () => {
    renderCard([entry()], fullResults());

    expect(
      screen.getByText("Full detail is kept for 90 days on hosted workspaces."),
    ).toBeInTheDocument();
  });

  it("states the database sentence when retention is unlimited", () => {
    renderCard([entry({ fullDetailUntil: null })], fullResults({ fullDetailUntil: null }), null);

    expect(
      screen.getByText(/Full detail is kept for as long as you keep the database/),
    ).toBeInTheDocument();
  });

  it("says a provider cannot report AI overviews instead of claiming there was none", () => {
    renderCard(
      [entry({ provider: "serpapi", providerLabel: "SerpApi" })],
      fullResults({ aiOverview: null, provider: "serpapi", providerLabel: "SerpApi" }),
    );

    expect(screen.getByText(/does not report AI overviews/)).toBeInTheDocument();
    expect(screen.queryByText(/An AI overview sat above them/)).not.toBeInTheDocument();
  });

  it("shows the compact record without a ladder", () => {
    renderCard([entry({ tier: "compact", retrievedPositions: null })], {
      checkId: CHECK_ID,
      checkedAt: "2025-04-12T06:00:00.000Z",
      domains: [{ bestPosition: 3, domain: "example.org" }],
      expiredAt: "2025-07-11T06:00:00.000Z",
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      tier: "compact",
    });

    expect(screen.getByText(/Compact record/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Retrieved results")).not.toBeInTheDocument();
  });

  it("explains a check that stored nothing without disowning its position", () => {
    renderCard([entry({ tier: "none", retrievedPositions: null })], {
      checkId: CHECK_ID,
      checkedAt: "2026-02-09T06:00:00.000Z",
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      tier: "none",
    });

    expect(screen.getByText("No stored results for this check")).toBeInTheDocument();
    expect(screen.getByText(/history built from it, are unaffected/)).toBeInTheDocument();
  });
});
