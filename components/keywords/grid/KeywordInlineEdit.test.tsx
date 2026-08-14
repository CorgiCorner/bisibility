import type { KeywordLocation, KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeywordInlineEdit } from "./KeywordInlineEdit";

// The location typeahead fetches /api/locations/search; never hit the network in tests.
const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ data: [] }),
}));
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockClear();
});

function mockLocations(items: unknown[]) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: items }),
  } as Response);
}

function location(overrides: Partial<KeywordLocation> = {}): KeywordLocation {
  return {
    canonicalKey: "US",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    id: "loc_us",
    kind: "country",
    ...overrides,
  };
}

function keyword(overrides: Partial<KeywordRow> = {}): KeywordRow {
  const loc = overrides.location ?? location();
  return {
    bestPosition: 3,
    cpc: "0.00",
    checkState: "ranked",
    createdAt: "2026-01-01T00:00:00.000Z",
    device: "Desktop",
    difficulty: 0,
    engine: "Google",
    hasRankData: true,
    id: "kw_1",
    keyword: "rank tracker",
    lastCheckAt: null,
    lastCheckStatus: null,
    location: loc,
    locationName: loc.displayName,
    position: 3,
    positionHistory: [],
    previousPosition: 4,
    rankingPages: 1,
    rankingPath: "/",
    rankingUrl: "https://example.com/",
    rankingUrlHistory: [],
    schedule: {
      cron_expression: null,
      frequency: "daily",
      jitter_minutes: 60,
      last_checked_at: null,
      next_check_at: null,
      timezone: "UTC",
    },
    serpFeatures: [],
    sparkline: [],
    tags: [],
    targetUrl: null,
    topic: null,
    intent: null,
    volume: 0,
    ...overrides,
    clicks: overrides.clicks ?? null,
    ctr: overrides.ctr ?? null,
    impressions: overrides.impressions ?? null,
    positionBaseline: overrides.positionBaseline === undefined ? 4 : overrides.positionBaseline,
    positionHistoryBoundaryAt: overrides.positionHistoryBoundaryAt ?? null,
  };
}

describe("KeywordInlineEdit", () => {
  it("uses active registry markets for a single drawer target", async () => {
    const updateKeywordAction = vi.fn(async () => ({}));
    render(
      <KeywordInlineEdit
        drawerMarkets={[
          {
            canonicalKey: "US",
            countryCode: "US",
            displayName: "United States",
            id: "pmkt_us",
            languageLabel: "English",
            languageCode: "en",
            monthlyCostCents: null,
            researchAvailable: true,
            status: "active",
          },
          {
            canonicalKey: "ES",
            countryCode: "ES",
            displayName: "Spain",
            id: "pmkt_es",
            languageLabel: "Spanish",
            languageCode: "es",
            monthlyCostCents: null,
            researchAvailable: true,
            status: "active",
          },
          {
            canonicalKey: "BE@fr",
            countryCode: "BE",
            displayName: "Belgium",
            id: "pmkt_be_fr",
            languageLabel: "French",
            languageCode: "fr",
            monthlyCostCents: null,
            researchAvailable: true,
            status: "paused",
          },
        ]}
        keyword={keyword()}
        layout="drawer"
        onSaved={vi.fn()}
        updateKeywordAction={updateKeywordAction}
      />,
    );

    expect(screen.queryByRole("combobox", { name: /location/i })).not.toBeInTheDocument();
    const market = screen.getByRole("combobox", { name: "Market" });
    expect(screen.getByRole("option", { name: "Belgium / French - paused" })).toBeDisabled();
    fireEvent.change(market, { target: { value: "ES" } });
    await waitFor(() => expect(market).toHaveDisplayValue("Spain / Spanish"));
    fireEvent.submit(market.closest("form") as HTMLFormElement);

    await waitFor(() => expect(updateKeywordAction).toHaveBeenCalledOnce());
    expect(updateKeywordAction).toHaveBeenCalledWith(
      expect.objectContaining({ keywordId: "kw_1", locationKey: "ES" }),
    );
  });

  it("keeps an off-catalog target visible but does not make it a new choice", () => {
    render(
      <KeywordInlineEdit
        drawerMarkets={[]}
        keyword={keyword({ location: location({ canonicalKey: "ES@ca", displayName: "Spain" }) })}
        layout="drawer"
        onSaved={vi.fn()}
        updateKeywordAction={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("option", { name: "Spain - no longer in registry" }),
    ).toBeInTheDocument();
  });

  it("provides help for editable keyword fields", () => {
    render(
      <KeywordInlineEdit keyword={keyword()} onSaved={vi.fn()} updateKeywordAction={vi.fn()} />,
    );

    const help = [
      "The exact search query being tracked.",
      "The page you expect to rank. Used to highlight when a different URL ranks instead.",
      "Desktop and mobile results often differ - each device is checked separately.",
      "Country or city the search results are localized to.",
      "Free-form grouping label for filtering and reporting.",
      "Search intent category (informational, transactional, ...) for filtering and reporting.",
      "Comma-separated labels for filtering; not sent to providers.",
    ];

    for (const text of help) {
      expect(screen.getByRole("button", { name: text })).toBeInTheDocument();
    }

    const tags = screen.getByLabelText("Tags");
    expect(tags).toHaveAttribute("id");
    expect(screen.getByText("Tags")).toHaveAttribute("for", tags.getAttribute("id"));
  });

  it("renders the location field and does not rewrite location when untouched", async () => {
    const updateKeywordAction = vi.fn();
    const onSaved = vi.fn();

    render(
      <KeywordInlineEdit
        keyword={keyword()}
        onSaved={onSaved}
        updateKeywordAction={updateKeywordAction}
      />,
    );

    expect(screen.getByRole("combobox", { name: /location/i })).toHaveDisplayValue("United States");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateKeywordAction).toHaveBeenCalledTimes(1);
    });
    expect(updateKeywordAction.mock.calls[0][0]).not.toHaveProperty("location");
    expect(updateKeywordAction.mock.calls[0][0]).not.toHaveProperty("locationKey");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("starts from the stored target URL and omits it when unchanged", async () => {
    const updateKeywordAction = vi.fn();

    render(
      <KeywordInlineEdit
        keyword={keyword({
          rankingPath: "/ranking-now",
          rankingUrl: "https://example.com/ranking-now",
          targetUrl: "https://example.com/canonical-target",
        })}
        onSaved={vi.fn()}
        updateKeywordAction={updateKeywordAction}
      />,
    );

    expect(screen.getByLabelText("Target URL")).toHaveDisplayValue(
      "https://example.com/canonical-target",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateKeywordAction).toHaveBeenCalledTimes(1);
    });
    expect(updateKeywordAction.mock.calls[0][0]).not.toHaveProperty("targetUrl");
  });

  it("renders topic and intent fields and submits their values", async () => {
    const updateKeywordAction = vi.fn();

    render(
      <KeywordInlineEdit
        keyword={keyword({ intent: "commercial", topic: "Product" })}
        onSaved={vi.fn()}
        updateKeywordAction={updateKeywordAction}
      />,
    );

    expect(screen.getByLabelText("Topic")).toHaveDisplayValue("Product");
    expect(screen.getByLabelText("Intent")).toHaveDisplayValue("commercial");

    fireEvent.change(screen.getByLabelText("Topic"), {
      target: { value: "Docs" },
    });
    fireEvent.change(screen.getByLabelText("Intent"), {
      target: { value: "informational" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateKeywordAction).toHaveBeenCalledWith(
        expect.objectContaining({ intent: "informational", topic: "Docs" }),
      );
    });
  });

  it("sends the canonical country when the country is changed", async () => {
    const updateKeywordAction = vi.fn();
    mockLocations([
      {
        canonical_key: "DE",
        city_name: null,
        country_code: "DE",
        display_name: "Germany",
        id: "country:DE",
        kind: "country",
        region_name: null,
      },
    ]);

    render(
      <KeywordInlineEdit
        keyword={keyword()}
        onSaved={vi.fn()}
        updateKeywordAction={updateKeywordAction}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: /location/i }), {
      target: { value: "ger" },
    });
    fireEvent.click(await screen.findByText("Germany"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateKeywordAction).toHaveBeenCalledWith(
        expect.objectContaining({ city: null, location: "Germany" }),
      );
    });
    expect(updateKeywordAction.mock.calls[0][0]).not.toHaveProperty("locationKey");
  });

  it("sends the selected city canonical key when the city is changed", async () => {
    const updateKeywordAction = vi.fn();
    mockLocations([
      {
        canonical_key: "US/Texas/Austin",
        city_name: "Austin",
        country_code: "US",
        display_name: "Austin, Texas, United States",
        id: "location:US/Texas/Austin",
        kind: "city",
        region_name: "Texas",
      },
    ]);

    render(
      <KeywordInlineEdit
        keyword={keyword()}
        onSaved={vi.fn()}
        projectId="prj_1"
        updateKeywordAction={updateKeywordAction}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: /location/i }), {
      target: { value: "aus" },
    });
    fireEvent.click(await screen.findByText("Austin"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateKeywordAction).toHaveBeenCalledWith(
        expect.objectContaining({ locationKey: "US/Texas/Austin" }),
      );
    });
  });
});
