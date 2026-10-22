import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RetrievedResultsCard } from "./RetrievedResultsCard";
import {
  CHECK_ID,
  entry,
  fullResults,
  OLDER_ID,
  renderCard,
} from "./retrieved-results-test-fixtures";

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

  it("gives competitors a separate card with the same synchronized stored-check picker", async () => {
    const older = entry({ checkId: OLDER_ID, checkedAt: "2026-07-26T06:00:00.000Z" });
    const loadResults = vi.fn(async () => [
      fullResults({
        checkId: OLDER_ID,
        checkedAt: older.checkedAt,
        trackedPosition: 30,
        rows: [
          {
            position: 9,
            domain: "rival.test",
            url: "https://rival.test/a",
            title: "Old result",
            tracked: false,
          },
        ],
      }),
    ]);
    render(
      <RetrievedResultsCard
        competitors={[{ publicId: "cmp_rival", domain: "rival.test", label: "Rival" }]}
        ownDomain="example.com"
        entries={[entry(), older]}
        initialResults={fullResults()}
        loadResults={loadResults}
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    const competitors = screen.getByRole("region", { name: "Competitors in this check" });
    expect(screen.getByTestId("retrieved-results-body")).not.toContainElement(competitors);
    const chooser = within(competitors).getByRole("button", { name: "Competitor check" });
    expect(chooser).toHaveTextContent("Aug 2, 2026");
    fireEvent.click(chooser);
    fireEvent.change(screen.getByLabelText("Jump to date"), { target: { value: "2026-07-26" } });
    await waitFor(() => expect(loadResults).toHaveBeenCalledExactlyOnceWith([OLDER_ID]));
    expect(screen.getByRole("button", { name: "Stored checks" })).toHaveTextContent("Jul 26, 2026");
    expect(within(competitors).getByRole("button", { name: "Competitor check" })).toHaveTextContent(
      "Jul 26, 2026",
    );
    expect(await within(competitors).findByRole("row", { name: /Rival/ })).toHaveTextContent("#9");
    fireEvent.click(screen.getByRole("button", { name: "Stored checks" }));
    fireEvent.change(screen.getByLabelText("Jump to date"), { target: { value: "2026-08-02" } });
    expect(within(competitors).getByRole("button", { name: "Competitor check" })).toHaveTextContent(
      "Aug 2, 2026",
    );
    expect(loadResults).toHaveBeenCalledOnce();
  });

  it("keeps the competitor date picker within the main later-check constraints in comparison mode", async () => {
    const older = entry({ checkId: OLDER_ID, checkedAt: "2026-07-26T06:00:00.000Z" });
    const loadResults = vi.fn(async () => [
      fullResults({ checkId: OLDER_ID, checkedAt: older.checkedAt }),
    ]);
    render(
      <RetrievedResultsCard
        competitors={[{ publicId: "cmp_rival", domain: "rival.test", label: "Rival" }]}
        ownDomain="example.com"
        entries={[entry(), older]}
        initialResults={fullResults()}
        loadResults={loadResults}
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    await waitFor(() => expect(loadResults).toHaveBeenCalledExactlyOnceWith([OLDER_ID]));
    fireEvent.click(screen.getByRole("button", { name: "Competitor check" }));
    fireEvent.change(screen.getByLabelText("Jump to date"), { target: { value: "2026-07-26" } });
    expect(screen.getByRole("button", { name: "Later check" })).toHaveTextContent("Aug 2, 2026");
    expect(screen.getByRole("button", { name: "Competitor check" })).toHaveTextContent(
      "Aug 2, 2026",
    );
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
    expect(screen.getByText(/remaining positions have no saved results/i)).toBeInTheDocument();
    expect(screen.queryByText(/never billed/i)).not.toBeInTheDocument();
  });

  it("warns before the result list when Top 20 competitor coverage is incomplete", () => {
    const results = fullResults({ requestedDepth: 20, retrievedPositions: 9, trackedPosition: 1 });
    results.rows = results.rows.filter((row) => row.position <= 9);
    renderCard([entry()], results);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Partial snapshot. Missing competitors may still rank in the Top 20.",
    );
  });

  it("warns about a gap within Top 20 even when the last saved rank reaches 20", () => {
    const results = fullResults({ requestedDepth: 20, retrievedPositions: 20 });
    results.rows = results.rows.filter((row) => row.position !== 2 && row.position <= 20);
    renderCard([entry()], results);
    expect(screen.getByRole("status")).toHaveTextContent("Partial snapshot.");
  });

  it("counts saved rows separately from their highest rank", () => {
    const results = fullResults();
    results.rows = results.rows.filter((row) => row.position !== 2);
    renderCard([entry()], results);
    expect(screen.getByTestId("retrieved-summary")).toHaveTextContent(
      "21 results saved · requested Top 100",
    );
    expect(screen.getByTestId("retrieved-summary")).not.toHaveTextContent("22 of 100");
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
