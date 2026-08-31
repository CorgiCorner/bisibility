import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function screenshotRows() {
  return [
    {
      domain: "contentful.com",
      position: 1,
      title: "What is a headless CMS?",
      tracked: false,
      url: "https://contentful.com",
    },
    {
      domain: "strapi.io",
      position: 2,
      title: "Strapi - Open source headless CMS",
      tracked: false,
      url: "https://strapi.io",
    },
    {
      domain: "sanity.io",
      position: 3,
      title: "Sanity - the composable content cloud",
      tracked: false,
      url: "https://sanity.io",
    },
    {
      domain: "acme.dev",
      position: 4,
      title: "Headless CMS for product teams - Acme",
      tracked: true,
      url: "https://acme.dev/headless-cms",
    },
    {
      domain: "storyblok.com",
      position: 5,
      title: "Storyblok: the enterprise headless CMS",
      tracked: false,
      url: "https://storyblok.com",
    },
    {
      domain: "hygraph.com",
      position: 6,
      title: "Hygraph - GraphQL-native headless CMS",
      tracked: false,
      url: "https://hygraph.com",
    },
    {
      domain: "en.wikipedia.org",
      position: 7,
      title: "Headless content management system",
      tracked: false,
      url: "https://en.wikipedia.org/wiki/Headless_content_management_system",
    },
  ];
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

  it("loads the second check only when comparison is entered", async () => {
    const { loadResults } = renderCard(
      [entry(), entry({ checkId: OLDER_ID, checkedAt: "2026-07-26T06:00:00.000Z", position: 26 })],
      fullResults(),
    );
    expect(loadResults).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Compare two" }));

    await waitFor(() => expect(loadResults).toHaveBeenCalledWith([OLDER_ID]));
  });

  it("matches the one-check screenshot contract and jumps to the tracked result", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderCard(
      [entry({ checkedAt: "2026-03-12T06:00:00.000Z", position: 4, retrievedPositions: 8 })],
      fullResults({
        checkedAt: "2026-03-12T06:00:00.000Z",
        features: ["answer box", "related questions", "sitelinks", "video"],
        requestedDepth: 100,
        retrievedPositions: 8,
        rows: screenshotRows(),
        trackedPosition: 4,
      }),
    );

    expect(screen.getByRole("heading", { name: "SERP snapshot" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "What Google returned around your result, kept from the moment each check ran.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "One check" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Stored checks" })).toHaveTextContent(
      "12 Mar 2026, 06:00 · top 8 kept",
    );
    expect(screen.getByText("8 of 100 retrieved")).toBeInTheDocument();

    const features = screen.getByTestId("retrieved-features");
    expect(features).toHaveClass("flex", "flex-wrap");
    const featureLabels = ["Featured snippet", "People also ask", "Sitelinks", "Video"];
    const featureNodes = featureLabels.map((label) => within(features).getByText(label));
    for (let index = 1; index < featureNodes.length; index++) {
      expect(featureNodes[index - 1]?.compareDocumentPosition(featureNodes[index] as Node)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    const summary = screen.getByTestId("retrieved-summary");
    expect(summary).toHaveTextContent("Your result#4/compare");
    expect(summary).not.toHaveClass("bg-bg-sunken");
    expect(screen.getByText("Headless CMS for product teams - Acme")).toBeInTheDocument();
    expect(screen.getByText("Your site")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Jump to your result" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(
      screen.getByText("Full detail is kept for 90 days on hosted workspaces."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Retrieved results")).toHaveClass(
      "max-h-[420px]",
      "overflow-y-auto",
    );
  });

  it("renders the compare header controls in screenshot order with neutral selected state", async () => {
    const older = fullResults({
      checkId: OLDER_ID,
      checkedAt: "2026-03-05T06:00:00.000Z",
      provider: "serpapi",
      providerLabel: "SerpApi",
      retrievedPositions: 8,
      rows: screenshotRows(),
      trackedPosition: 6,
    });
    const current = fullResults({
      checkedAt: "2026-03-12T06:00:00.000Z",
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      retrievedPositions: 8,
      rows: screenshotRows(),
      trackedPosition: 4,
    });
    const loadResults = vi.fn(async () => [older]);
    render(
      <RetrievedResultsCard
        entries={[
          entry({ checkedAt: current.checkedAt, position: 4, retrievedPositions: 8 }),
          entry({
            checkId: OLDER_ID,
            checkedAt: older.checkedAt,
            position: 6,
            provider: "serpapi",
            providerLabel: "SerpApi",
            retrievedPositions: 8,
          }),
        ]}
        initialResults={current}
        loadResults={loadResults}
        rankingUrl="/headless-cms"
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare two" }));
    await screen.findByRole("heading", { name: "SERP snapshots" });

    const header = screen.getByTestId("retrieved-header");
    expect(within(header).getByText("From")).toHaveClass("uppercase");
    expect(within(header).getByText("To")).toHaveClass("uppercase");
    expect(within(header).getByRole("button", { name: "Earlier check" })).toHaveTextContent(
      "5 Mar 2026, 06:00 · top 8 kept",
    );
    expect(within(header).getByRole("button", { name: "Later check" })).toHaveTextContent(
      "12 Mar 2026, 06:00 · top 8 kept",
    );
    const selected = screen.getByRole("button", { name: "Compare two" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected).not.toHaveClass("bg-accent-soft");
    expect(within(header).getByRole("button", { name: "Earlier check" })).toHaveClass(
      "min-h-[34px]",
    );
    expect(within(header).getByRole("button", { name: "Later check" })).toHaveClass("min-h-[34px]");
  });

  it("uses one outer card outline without an enclosing header border", () => {
    renderCard([entry()], fullResults());
    const card = screen.getByTestId("retrieved-results-card");
    expect(card).toHaveClass("MuiCard-root");
    expect(card.querySelectorAll(".MuiCard-root")).toHaveLength(0);
    const header = screen.getByTestId("retrieved-header");
    expect(header).toHaveClass("border-b");
    expect(header).not.toHaveClass("border", "rounded-card");
  });

  it("disables comparison when fewer than two retained checks exist", () => {
    const single = renderCard([entry()], fullResults());
    const compare = screen.getByRole("button", { name: "Compare two" });
    expect(compare).toBeDisabled();
    fireEvent.click(compare);
    expect(single.loadResults).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "SERP snapshot" })).toBeInTheDocument();
  });

  it("ignores purged history when deciding whether comparison is available", () => {
    const { loadResults } = renderCard(
      [entry(), entry({ checkId: OLDER_ID, tier: "none", retrievedPositions: null })],
      fullResults(),
    );
    const compare = screen.getByRole("button", { name: "Compare two" });
    expect(compare).toBeDisabled();
    fireEvent.click(compare);
    expect(loadResults).not.toHaveBeenCalled();
  });

  it("allows full and compact history to enter comparison and show refusal", async () => {
    const compact: RetrievedResults = {
      checkId: OLDER_ID,
      checkedAt: "2026-01-04T06:00:00Z",
      domains: [{ bestPosition: 3, domain: "example.org" }],
      expiredAt: null,
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      tier: "compact",
    };
    render(
      <RetrievedResultsCard
        entries={[
          entry(),
          entry({
            checkId: OLDER_ID,
            checkedAt: compact.checkedAt,
            retrievedPositions: 3,
            tier: "compact",
          }),
        ]}
        initialResults={fullResults()}
        loadResults={async () => [compact]}
        rankingUrl={null}
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    const compare = screen.getByRole("button", { name: "Compare two" });
    expect(compare).toBeEnabled();
    fireEvent.click(compare);
    expect(await screen.findByText("These two checks cannot be compared")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The earlier check kept only its top 3, so its titles, URLs and page features below that are gone.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps loading and error states truthful in both modes", async () => {
    const pending = new Promise<RetrievedResults[]>(() => {});
    const { rerender } = render(
      <RetrievedResultsCard
        entries={[entry()]}
        initialResults={null}
        loadResults={() => pending}
        rankingUrl={null}
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    expect(screen.getByText("Loading stored results...")).toBeInTheDocument();

    rerender(
      <RetrievedResultsCard
        entries={[entry(), entry({ checkId: OLDER_ID })]}
        initialResults={fullResults()}
        loadResults={async () => {
          throw new Error("nope");
        }}
        rankingUrl={null}
        retentionDays={90}
        timeZone="UTC"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare two" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Stored results could not be loaded. Try again.",
    );
  });
});
