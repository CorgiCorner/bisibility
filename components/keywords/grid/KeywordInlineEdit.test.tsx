import { KeywordPendingDetail } from "@/components/keywords/KeywordPendingDetail";
import { ToastProvider } from "@/components/ui";
import type { KeywordLocation, KeywordRow } from "@/lib/queries/keywords";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeywordInlineEdit } from "./KeywordInlineEdit";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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

  it("keeps a legacy stored country selectable without rewriting it when untouched", async () => {
    const updateKeywordAction = vi.fn();

    render(
      <KeywordInlineEdit
        keyword={keyword({
          location: location({
            countryCode: "",
            displayName: "Global",
            id: "loc_legacy",
          }),
        })}
        onSaved={vi.fn()}
        updateKeywordAction={updateKeywordAction}
      />,
    );

    expect(screen.getByRole("combobox", { name: /location/i })).toHaveDisplayValue("Global");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateKeywordAction).toHaveBeenCalledTimes(1);
    });
    expect(updateKeywordAction.mock.calls[0][0]).not.toHaveProperty("location");
  });

  it("uses the structured country code for city keywords", () => {
    render(
      <KeywordInlineEdit
        keyword={keyword({
          location: location({
            canonicalKey: "US/Texas/Austin",
            cityName: "Austin",
            countryCode: "US",
            displayName: "Austin, Texas, United States",
            id: "loc_austin",
            kind: "city",
          }),
          locationName: "Austin, Texas, United States",
        })}
        onSaved={vi.fn()}
        updateKeywordAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: /location/i })).toHaveDisplayValue(
      "Austin, Texas, United States",
    );
    expect(screen.queryByText(/Cities need a supported country/i)).not.toBeInTheDocument();
  });

  it("surfaces degraded location warnings without closing the edit form", async () => {
    const updateKeywordAction = vi.fn(async () => ({
      warning: "Tracking at country level.",
    }));
    const onSaved = vi.fn();

    render(
      <KeywordInlineEdit
        keyword={keyword({ keyword: "rank tracker updated" })}
        onSaved={onSaved}
        updateKeywordAction={updateKeywordAction}
      />,
    );

    fireEvent.change(screen.getByLabelText("Keyword"), {
      target: { value: "rank tracker updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Tracking at country level.")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("KeywordPendingDetail", () => {
  it("renders the inline edit control for keywords awaiting their first check", async () => {
    const updateKeywordAction = vi.fn();

    render(
      <KeywordPendingDetail
        bulkDeleteAction={vi.fn()}
        canDeleteKeyword
        canManageProviders
        canUpdateKeyword
        keyword={keyword({
          checkState: "never_checked",
          hasRankData: false,
          targetUrl: "/preferred",
        })}
        providerConnected={false}
        projectId="prj_1"
        projectRef="prj_1"
        runCheckNowAction={vi.fn()}
        updateKeywordAction={updateKeywordAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    expect(screen.getByLabelText("Target URL")).toHaveDisplayValue("/preferred");

    fireEvent.click(screen.getByRole("button", { name: "Save details" }));

    await waitFor(() => {
      expect(updateKeywordAction).toHaveBeenCalledTimes(1);
    });
    expect(updateKeywordAction.mock.calls[0][0]).not.toHaveProperty("targetUrl");
  });

  it.each([
    ["never_checked", "First check pending", "No rank check has been attempted yet"],
    ["running", "Check running", "A rank check is currently running"],
    ["failed", "Latest check failed", "The latest rank check failed"],
    ["not_ranked", "Not in top 100", "The latest rank check completed"],
  ] as const)("renders honest %s detail copy", (checkState, badge, body) => {
    render(
      <KeywordPendingDetail
        bulkDeleteAction={vi.fn()}
        canDeleteKeyword
        canManageProviders
        canUpdateKeyword
        keyword={keyword({ checkState, hasRankData: false })}
        providerConnected={false}
        projectId="prj_1"
        projectRef="prj_1"
        runCheckNowAction={vi.fn()}
        updateKeywordAction={vi.fn()}
      />,
    );

    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(screen.getByText(body, { exact: false })).toBeInTheDocument();
  });

  it("runs the first check directly when a SERP provider is connected", async () => {
    const runCheckNowAction = vi.fn(async () => undefined);

    render(
      <ToastProvider>
        <KeywordPendingDetail
          bulkDeleteAction={vi.fn()}
          canDeleteKeyword
          canManageProviders
          canUpdateKeyword
          keyword={keyword({ checkState: "never_checked", hasRankData: false })}
          providerConnected
          projectId="prj_1"
          projectRef="prj_1"
          runCheckNowAction={runCheckNowAction}
          updateKeywordAction={vi.fn()}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run first check" }));

    await waitFor(() => expect(runCheckNowAction).toHaveBeenCalledWith({ keywordId: "kw_1" }));
    expect(screen.getByText("Check started")).toBeInTheDocument();
    expect(screen.queryByText("View integrations")).not.toBeInTheDocument();
  });

  it("shows a toast when the first check fails", async () => {
    const runCheckNowAction = vi.fn(async () => {
      throw new Error("Check unavailable");
    });

    render(
      <ToastProvider>
        <KeywordPendingDetail
          bulkDeleteAction={vi.fn()}
          canDeleteKeyword
          canManageProviders
          canUpdateKeyword
          keyword={keyword({ checkState: "never_checked", hasRankData: false })}
          providerConnected
          projectId="prj_1"
          projectRef="prj_1"
          runCheckNowAction={runCheckNowAction}
          updateKeywordAction={vi.fn()}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run first check" }));

    expect(await screen.findByText("Check unavailable")).toBeInTheDocument();
  });

  it("treats a serialized budget rejection as a failed first check", async () => {
    const runCheckNowAction = vi.fn().mockResolvedValue({
      code: "budget_exhausted",
      message: "Rank check monthly budget reached.",
      status: "not_started",
    });

    render(
      <ToastProvider>
        <KeywordPendingDetail
          bulkDeleteAction={vi.fn()}
          canDeleteKeyword
          canManageProviders
          canUpdateKeyword
          keyword={keyword({ checkState: "never_checked", hasRankData: false })}
          providerConnected
          projectId="prj_1"
          projectRef="prj_1"
          runCheckNowAction={runCheckNowAction}
          updateKeywordAction={vi.fn()}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run first check" }));

    expect(await screen.findByText("Rank check monthly budget reached.")).toBeInTheDocument();
    expect(screen.queryByText("Check started")).not.toBeInTheDocument();
  });

  it("links to a specific provider action when no SERP provider is connected", () => {
    render(
      <KeywordPendingDetail
        bulkDeleteAction={vi.fn()}
        canDeleteKeyword
        canManageProviders
        canUpdateKeyword
        keyword={keyword({ checkState: "never_checked", hasRankData: false })}
        providerConnected={false}
        projectId="prj_1"
        projectRef="prj_1"
        runCheckNowAction={vi.fn()}
        updateKeywordAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: /Connect a SERP provider/ })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
  });
});
