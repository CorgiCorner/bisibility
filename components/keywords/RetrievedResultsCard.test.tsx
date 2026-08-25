import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RetrievedResultsCard } from "./RetrievedResultsCard";

const CHECK_ID = "chk_aug02";
const OLDER_ID = "chk_jul26";

function entry(overrides: Partial<StoredResultsIndexEntry> = {}): StoredResultsIndexEntry {
  return {
    checkId: CHECK_ID,
    checkedAt: "2026-08-02T06:00:00.000Z",
    degradedToCountry: false,
    fullDetailUntil: "2026-10-31T06:00:00.000Z",
    position: 22,
    provider: "dataforseo",
    providerLabel: "DataForSEO",
    requestedDepth: 100,
    retrievedPositions: 22,
    stoppedAtResult: true,
    tier: "full",
    ...overrides,
  };
}

function fullResults(overrides: Partial<Extract<RetrievedResults, { tier: "full" }>> = {}) {
  const rows = Array.from({ length: 22 }, (_, index) => ({
    domain: index === 21 ? "example.com" : `sub${index}.example.org`,
    position: index + 1,
    title: `Result ${index + 1}`,
    tracked: index === 21,
    url: index === 21 ? "https://example.com/compare" : `https://sub${index}.example.org/page`,
  }));
  return {
    aiOverview: true,
    checkId: CHECK_ID,
    checkedAt: "2026-08-02T06:00:00.000Z",
    features: ["ai overview", "people also ask"],
    fullDetailUntil: "2026-10-31T06:00:00.000Z",
    provider: "dataforseo",
    providerLabel: "DataForSEO",
    requestedDepth: 100,
    retrievedPositions: 22,
    rows,
    stoppedAtResult: true,
    tier: "full" as const,
    trackedPosition: 22,
    ...overrides,
  };
}

function renderCard(
  entries: StoredResultsIndexEntry[],
  results: RetrievedResults,
  retentionDays: number | null = 90,
) {
  const loadResults = vi.fn(async () => [results]);
  render(
    <RetrievedResultsCard
      entries={entries}
      initialResults={results}
      loadResults={loadResults}
      rankingUrl="/compare"
      retentionDays={retentionDays}
      timeZone="UTC"
    />,
  );
  return { loadResults };
}

describe("RetrievedResultsCard", () => {
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
    expect(scroller.scrollTop).toBe(21 * 52 - 3 * 52 - 46);
  });

  it("derives the retention footer from the injected retention window", () => {
    renderCard([entry()], fullResults());

    expect(screen.getByText(/90 days after it ran/)).toBeInTheDocument();
  });

  it("states the database sentence when retention is unlimited", () => {
    renderCard([entry({ fullDetailUntil: null })], fullResults({ fullDetailUntil: null }), null);

    expect(
      screen.getByText(/Full detail for this check is kept for as long as you keep the database/),
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

  it("loads the second check only when comparison is entered", async () => {
    const { loadResults } = renderCard(
      [entry(), entry({ checkId: OLDER_ID, checkedAt: "2026-07-26T06:00:00.000Z", position: 26 })],
      fullResults(),
    );
    expect(loadResults).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Compare two" }));

    await waitFor(() => expect(loadResults).toHaveBeenCalledWith([OLDER_ID]));
  });
});
