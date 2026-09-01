import { ToastProvider } from "@/components/ui";
import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import { ROWS_PAGE_LIMIT, SEARCH_INSIGHTS_ROWS_CAP } from "@/lib/search-insights/constants";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInsightsDrawerContext } from "./drawers/useDrawerHandlers";
import { SearchInsightsBody } from "./SearchInsightsBody";
import {
  storyFirstView,
  storyImportFacts,
  storyImportState,
  storyQueryRows,
} from "./search-insights-story-fixtures";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/client", () => ({ track: mocks.track }));

function queryRows(count: number, prefix = "stored query") {
  return Array.from({ length: count }, (_, index) => ({
    clicks: 500 - index,
    ctr: 0.02,
    impressions: 20_000,
    position: 12.4,
    query: `${prefix} ${index}`,
  }));
}

function view(overrides: Partial<SearchInsightsFirstView> = {}): SearchInsightsFirstView {
  return { ...storyFirstView, ...overrides };
}

type BodyOptions = {
  ga4Card?: React.ReactNode;
  importState?: SearchInsightsImportState | null;
  loadRowsAction?: LoadSearchInsightsRowsAction;
  onTrack?: (row: { query: string }) => void;
  period?: string;
  property?: string;
  view?: SearchInsightsFirstView;
};

function body(options: BodyOptions = {}) {
  const loadRowsAction =
    options.loadRowsAction ?? ((async () => ({ kind: "pages", rows: [], total: 0 })) as never);
  return (
    <ToastProvider>
      <SearchInsightsBody
        ga4Card={options.ga4Card}
        importState={options.importState ?? null}
        loadRowsAction={loadRowsAction}
        onTrack={options.onTrack}
        period={options.period ?? "28"}
        projectId="prj_1"
        property={options.property ?? "sc-domain:example.com"}
        view={options.view ?? view()}
      />
    </ToastProvider>
  );
}

function renderBody(options: BodyOptions = {}) {
  return render(body(options));
}

function pageRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    clicks: 300 - index,
    ctr: 0.03,
    impressions: 9_000,
    path: `/guide/${index}`,
    position: 8.2,
    sessions: null,
    url: `https://example.com/guide/${index}`,
  }));
}

function queriesCard() {
  return screen.getByRole("heading", { name: "Top queries" }).closest("section") as HTMLElement;
}

function pagesCard() {
  return screen.getByRole("heading", { name: "Top pages" }).closest("section") as HTMLElement;
}

describe("SearchInsightsBody", () => {
  beforeEach(() => {
    mocks.track.mockReset();
  });

  it("renders the KPI row, both chips and both tables from stored rows", () => {
    renderBody();

    expect(screen.getByText("12,480")).toBeInTheDocument();
    expect(screen.getByText("queries at positions 4-20")).toBeInTheDocument();
    expect(screen.getByText("queries with page overlap")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Top queries" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Top pages" })).toBeInTheDocument();
    expect(screen.getByText(/the two tables never sum to the KPI row/)).toBeInTheDocument();
  });

  it("renders only the import-waiting reason in both empty cards before the first view is ready", () => {
    renderBody({
      importState: {
        ...storyImportState,
        facts: {
          ...storyImportFacts,
          readyThrough: {
            ...storyImportFacts.readyThrough,
            d7: { current: false, previous: false },
          },
        },
      },
      view: view({
        pages: { rows: [], total: 0 },
        queries: { rows: [], total: 0 },
      }),
    });

    for (const card of [queriesCard(), pagesCard()]) {
      expect(
        within(card).getByText(
          "Waiting for the first finalized days. Rows appear here after finalized days are imported.",
        ),
      ).toBeInTheDocument();
      expect(within(card).queryByText("0 of 0")).not.toBeInTheDocument();
      expect(within(card).queryByRole("table")).not.toBeInTheDocument();
      expect(within(card).queryByRole("columnheader")).not.toBeInTheDocument();
      expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/the two tables never sum to the KPI row/)).not.toBeInTheDocument();
    expect(screen.queryByText(/7 finalized days/)).not.toBeInTheDocument();
  });

  it("explains privacy only in an empty queries card when pages have traffic", () => {
    renderBody({
      importState: storyImportState,
      view: view({ queries: { rows: [], total: 0 } }),
    });

    expect(
      within(queriesCard()).getByText(
        "Google named no queries in this window. The traffic in Top pages is real - its query text is withheld for privacy.",
      ),
    ).toBeInTheDocument();
    expect(within(queriesCard()).queryByRole("table")).not.toBeInTheDocument();
    expect(within(pagesCard()).getByRole("table", { name: "Top pages" })).toBeInTheDocument();
    expect(within(pagesCard()).queryByText(/withheld for privacy/)).not.toBeInTheDocument();
    expect(screen.queryByText(/the two tables never sum to the KPI row/)).not.toBeInTheDocument();
  });

  it("uses the no-traffic reason in both empty cards once the window is covered", () => {
    renderBody({
      importState: storyImportState,
      view: view({
        pages: { rows: [], total: 0 },
        queries: { rows: [], total: 0 },
      }),
    });

    for (const card of [queriesCard(), pagesCard()]) {
      expect(
        within(card).getByText(
          "Google reported no search traffic for this property in this window.",
        ),
      ).toBeInTheDocument();
      expect(within(card).queryByText(/privacy/i)).not.toBeInTheDocument();
      expect(within(card).queryByRole("table")).not.toBeInTheDocument();
      expect(within(card).queryByRole("columnheader")).not.toBeInTheDocument();
      expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    }
    expect(screen.queryByText("0 of 0")).not.toBeInTheDocument();
    expect(screen.queryByText(/the two tables never sum to the KPI row/)).not.toBeInTheDocument();
  });

  it("threads the same-view named query total through both signal chip opens", async () => {
    const openList = vi.fn();
    render(
      <SearchInsightsDrawerContext.Provider
        value={{
          adding: new Set(),
          openList,
          openPage: vi.fn(),
          openQuery: vi.fn(),
          track: vi.fn(),
          tracked: new Set(),
        }}
      >
        {body({ view: view({ queries: { ...storyFirstView.queries, total: 47 } }) })}
      </SearchInsightsDrawerContext.Provider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /queries at positions 4-20/ }));
    await userEvent.click(screen.getByRole("button", { name: /queries with page overlap/ }));

    expect(openList).toHaveBeenNthCalledWith(1, "band", storyFirstView.signals.bandCount, 47);
    expect(openList).toHaveBeenNthCalledWith(2, "overlap", storyFirstView.signals.overlapCount, 47);
  });

  it("reports the chip kind without sending row data to analytics", async () => {
    renderBody();

    await userEvent.click(screen.getByRole("button", { name: /queries at positions 4-20/ }));
    await userEvent.click(screen.getByRole("button", { name: /queries with page overlap/ }));

    expect(mocks.track).toHaveBeenCalledWith("search_insights_chip_opened", { which: "band" });
    expect(mocks.track).toHaveBeenCalledWith("search_insights_chip_opened", { which: "overlap" });
  });

  it("shows the connect card until sessions are connected", () => {
    renderBody();

    expect(screen.getByText("Organic sessions (GA4)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect" })).toBeInTheDocument();
  });

  it("keeps the sessions slot visible while a connected GA4 import catches up", () => {
    renderBody({
      view: view({
        organicSessions: {
          importState: {
            ...storyImportState,
            createdAt: "2026-07-01T00:00:00.000Z",
            daysDone: 20,
            daysTotal: 488,
            finalizedThroughDate: null,
            lastSyncStartedAt: "2026-07-08T02:00:00.000Z",
            state: "running",
            updatedAt: "2026-07-08T04:00:00.000Z",
          },
          property: "123456789",
          status: "connected",
        },
        sessionsKpi: null,
        sessionsReadable: false,
      }),
    });

    expect(screen.getByText("Organic sessions")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Ready in ~4 hr")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("does not infer a GA4 ETA before the import has observed progress", () => {
    renderBody({
      view: view({
        organicSessions: {
          importState: {
            ...storyImportState,
            createdAt: "2026-07-08T02:00:00.000Z",
            daysDone: 0,
            daysTotal: 488,
            finalizedThroughDate: null,
            state: "running",
            updatedAt: "2026-07-08T04:00:00.000Z",
          },
          property: "123456789",
          status: "connected",
        },
        sessionsKpi: null,
        sessionsReadable: false,
      }),
    });

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText(/^Ready in /)).not.toBeInTheDocument();
  });

  it("keeps the sessions slot pending when completed GA4 data is one day behind GSC", () => {
    renderBody({
      importState: { ...storyImportState, newestFinalizedDate: "2026-07-08" },
      view: view({
        organicSessions: {
          importState: {
            ...storyImportState,
            cursorDate: null,
            finalizedThroughDate: "2026-07-07",
            state: "completed",
          },
          property: "123456789",
          status: "connected",
        },
        sessionsKpi: null,
        sessionsReadable: false,
      }),
    });

    expect(screen.getByText("Organic sessions")).toBeInTheDocument();
    expect(screen.getByText("Waiting for today's GA4 data")).toBeInTheDocument();
    expect(screen.getByText("GA4 has not finalized today's data yet.")).toBeInTheDocument();
  });

  it("describes other completed GA4 coverage gaps without calling them today's data", () => {
    renderBody({
      importState: { ...storyImportState, newestFinalizedDate: "2026-07-08" },
      view: view({
        organicSessions: {
          importState: {
            ...storyImportState,
            cursorDate: null,
            finalizedThroughDate: "2026-07-06",
            state: "completed",
          },
          property: "123456789",
          status: "connected",
        },
        sessionsKpi: null,
        sessionsReadable: false,
      }),
    });

    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("GA4 history does not cover this comparison yet.")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for today's GA4 data")).not.toBeInTheDocument();
  });

  it("names a connected source that needs reauthentication instead of dropping its KPI slot", () => {
    renderBody({
      view: view({
        organicSessions: { importState: null, property: "123456789", status: "needs_reauth" },
        sessionsKpi: null,
        sessionsReadable: false,
      }),
    });

    expect(screen.getByText("Organic sessions")).toBeInTheDocument();
    expect(screen.getByText("Needs reauth")).toBeInTheDocument();
    expect(screen.getByText("Reconnect GA4 before the import can continue.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("keeps GSC metrics and tables around a localized GA4 setup card", () => {
    renderBody({ ga4Card: <div>GA4 property setup</div> });

    expect(screen.getByText("12,480")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Top queries" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Top pages" })).toBeInTheDocument();
    expect(screen.getByText("GA4 property setup")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("swaps Top pages to sessions and exposes the management link once connected", () => {
    renderBody({
      view: view({
        organicSessions: { importState: null, property: "123456789", status: "connected" },
        pages: { rows: [{ ...pageRows(1)[0], sessions: 84 }], total: 1 },
        sessionsKpi: {
          delta: "+2%",
          dir: "up",
          label: "Organic sessions",
          prev: "82",
          source: "GA4",
          value: "84",
        },
        sessionsReadable: true,
      }),
    });

    const card = pagesCard();
    expect(within(card).getByRole("columnheader", { name: "Sessions" })).toHaveAttribute(
      "title",
      "Joined from GA4 by landing page. Search Console counts clicks and GA4 counts sessions, so the two never match exactly and a gap is normal.",
    );
    expect(within(card).getByText("84")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage GA4" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations?connect=ga4",
    );
    expect(screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("keeps a connected import out of the sessions table until its history is readable", () => {
    renderBody({
      view: view({
        organicSessions: { importState: null, property: "123456789", status: "connected" },
        sessionsReadable: false,
      }),
    });

    const card = pagesCard();
    expect(within(card).queryByRole("columnheader", { name: "Sessions" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage GA4" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations?connect=ga4",
    );
    expect(screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("keeps the management link absent until the sessions integration connects", () => {
    renderBody();

    expect(screen.queryByRole("link", { name: "Manage GA4" })).not.toBeInTheDocument();
  });

  it("shows ten of the loaded rows and says how many the window holds", () => {
    renderBody();

    const card = queriesCard();
    expect(within(card).getByText("10 of 1,284")).toBeInTheDocument();
    expect(within(card).getAllByRole("row")).toHaveLength(11);
  });

  it("marks a tracked query without asking, and offers Track for the rest", () => {
    renderBody();

    const card = queriesCard();
    expect(within(card).getAllByTitle("Already tracked in Rank Tracker")).toHaveLength(2);
    expect(within(card).getAllByTitle("Add this query to Rank Tracker")).toHaveLength(8);
  });

  it("opens the track flow rather than adding a paid check silently", async () => {
    const onTrack = vi.fn();
    renderBody({ onTrack });

    await userEvent.click(within(queriesCard()).getAllByTitle("Add this query to Rank Tracker")[0]);

    expect(onTrack).toHaveBeenCalledWith(
      expect.objectContaining({ query: storyQueryRows[1].query }),
    );
  });

  it("grows to the loaded fifty without asking the server for rows it already holds", async () => {
    const loadRowsAction = vi.fn();
    renderBody({
      loadRowsAction: loadRowsAction as never,
      view: view({ queries: { rows: queryRows(50), total: 1_284 } }),
    });

    const card = queriesCard();
    const more = within(card).getByRole("button", { name: /Show more/ });
    expect(within(card).queryByRole("button", { name: /Show top 10/ })).toBeNull();
    await userEvent.click(more);

    expect(loadRowsAction).not.toHaveBeenCalled();
    expect(within(card).getByText("50 of 1,284")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /Show all/ })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /Show top 10/ })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(card.querySelector("[aria-pressed]")).toBeNull();
  });

  it("pages the archived property remainder to the real total", async () => {
    const loadRowsAction = vi.fn(async () => ({
      kind: "pages" as const,
      rows: pageRows(9),
      total: 59,
    }));
    renderBody({
      loadRowsAction: loadRowsAction as never,
      property: "sc-domain:archived.example.com",
      view: view({ pages: { rows: pageRows(50), total: 59 } }),
    });

    const card = pagesCard();
    await userEvent.click(within(card).getByRole("button", { name: /Show more/ }));
    await userEvent.click(within(card).getByRole("button", { name: /Show all 59/ }));

    await waitFor(() => expect(within(card).getByText("59 of 59")).toBeInTheDocument());
    expect(loadRowsAction).toHaveBeenCalledWith({
      kind: "pages",
      limit: 9,
      offset: 50,
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
    });
  });

  it("pages the rest of the window in, then lets the counter collapse it again", async () => {
    const loadRowsAction = vi.fn(async () => ({
      kind: "queries" as const,
      rows: queryRows(30, "paged query"),
      total: 80,
      trackedTexts: [],
    }));
    renderBody({
      loadRowsAction: loadRowsAction as never,
      view: view({ queries: { rows: queryRows(50), total: 80 } }),
    });

    const card = queriesCard();
    await userEvent.click(within(card).getByRole("button", { name: /Show more/ }));
    await userEvent.click(within(card).getByRole("button", { name: /Show all 80/ }));

    await waitFor(() => expect(within(card).getByText("80 of 80")).toBeInTheDocument());
    // Only the rows the window still owes, never a full page past the end of it.
    expect(loadRowsAction).toHaveBeenCalledWith({
      kind: "queries",
      limit: 30,
      offset: 50,
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:example.com",
    });

    await userEvent.click(within(card).getByTitle("Back to the top 10 rows"));
    expect(within(card).getByText("10 of 80")).toBeInTheDocument();
  });

  it("drops loaded rows when the canonical property changes with the same view identity", async () => {
    const sharedView = view({ pages: { rows: pageRows(50), total: 59 } });
    const loadRowsAction = vi.fn(async () => ({
      kind: "pages" as const,
      rows: pageRows(9),
      total: 59,
    }));
    const { rerender } = renderBody({ loadRowsAction: loadRowsAction as never, view: sharedView });

    await userEvent.click(within(pagesCard()).getByRole("button", { name: /Show more/ }));
    await userEvent.click(within(pagesCard()).getByRole("button", { name: /Show all 59/ }));
    await waitFor(() => expect(within(pagesCard()).getByText("59 of 59")).toBeInTheDocument());

    rerender(
      body({
        loadRowsAction: loadRowsAction as never,
        property: "sc-domain:archived.example.com",
        view: sharedView,
      }),
    );

    expect(within(pagesCard()).getByText("10 of 59")).toBeInTheDocument();
  });

  it("shows the new window's rows after a period switch, not the previous window's", async () => {
    // Changing the window is a soft navigation: the server sends a new view and React keeps
    // this instance, so the rows that were fetched for the old window have to go.
    const { rerender } = renderBody({
      view: view({ queries: { rows: queryRows(50, "twentyeight"), total: 1_284 } }),
    });
    await userEvent.click(within(queriesCard()).getByRole("button", { name: /Show more/ }));
    expect(within(queriesCard()).getByText("twentyeight 0")).toBeInTheDocument();

    rerender(
      body({
        period: "90",
        view: view({
          queries: { rows: queryRows(12, "ninety"), total: 96 },
          trackedTexts: [],
        }),
      }),
    );

    const card = queriesCard();
    expect(within(card).getByText("ninety 0")).toBeInTheDocument();
    expect(within(card).queryByText("twentyeight 0")).not.toBeInTheDocument();
    expect(within(card).getByText("10 of 96")).toBeInTheDocument();
  });

  it("stops a saturated window at the cap instead of paging the whole property in", async () => {
    // Every page re-aggregates the window on the server and then lives in the browser, so the
    // expansion reaches the busiest rows and the export carries the rest.
    const loadRowsAction = vi.fn(async (input: { limit: number; offset: number }) => ({
      kind: "queries" as const,
      rows: Array.from({ length: input.limit }, (_, index) => ({
        clicks: 400,
        ctr: 0.02,
        impressions: 20_000,
        position: 12.4,
        query: `paged query ${input.offset + index}`,
      })),
      total: 120_000,
      trackedTexts: [],
    }));
    renderBody({
      loadRowsAction: loadRowsAction as never,
      view: view({ queries: { rows: queryRows(50), total: 120_000 } }),
    });

    const card = queriesCard();
    await userEvent.click(within(card).getByRole("button", { name: /Show more/ }));
    await userEvent.click(within(card).getByRole("button", { name: /Show top 5,000/ }));

    await waitFor(() => expect(within(card).getByText("5,000 of 120,000")).toBeInTheDocument());
    const asked = loadRowsAction.mock.calls.map(([input]) => input.limit);
    expect(asked.reduce((total, limit) => total + limit, 0)).toBe(SEARCH_INSIGHTS_ROWS_CAP - 50);
    expect(asked.every((limit) => limit <= ROWS_PAGE_LIMIT)).toBe(true);
  });

  it("keeps each table's spinner on its own request", async () => {
    let releaseQueries = () => {};
    const held = new Promise<void>((resolve) => {
      releaseQueries = resolve;
    });
    const loadRowsAction = vi.fn(async (input: { kind: "pages" | "queries" }) => {
      if (input.kind === "pages") return { kind: "pages" as const, rows: pageRows(30), total: 80 };
      await held;
      return {
        kind: "queries" as const,
        rows: queryRows(30, "paged query"),
        total: 80,
        trackedTexts: [],
      };
    });
    renderBody({
      loadRowsAction: loadRowsAction as never,
      view: view({
        pages: { rows: pageRows(50), total: 80 },
        queries: { rows: queryRows(50), total: 80 },
      }),
    });

    const queries = queriesCard();
    const pages = pagesCard();
    await userEvent.click(within(queries).getByRole("button", { name: /Show more/ }));
    await userEvent.click(within(queries).getByRole("button", { name: /Show all 80/ }));
    await userEvent.click(within(pages).getByRole("button", { name: /Show more/ }));
    await userEvent.click(within(pages).getByRole("button", { name: /Show all 80/ }));

    // The pages settled first; the queries request is still out, so its control stays busy.
    await waitFor(() => expect(within(pages).getByText("80 of 80")).toBeInTheDocument());
    expect(within(queries).getByRole("button", { name: /Show all 80/ })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    releaseQueries();
    await waitFor(() => expect(within(queries).getByText("80 of 80")).toBeInTheDocument());
  });

  it("keeps the table usable when a page of rows cannot be loaded", async () => {
    // A rejection with nothing user-safe in it falls back to the module's own sentence.
    const loadRowsAction = vi.fn(async () => {
      throw new Error("");
    });
    renderBody({
      loadRowsAction: loadRowsAction as never,
      view: view({ queries: { rows: queryRows(50), total: 80 } }),
    });

    const card = queriesCard();
    await userEvent.click(within(card).getByRole("button", { name: /Show more/ }));
    await userEvent.click(within(card).getByRole("button", { name: /Show all 80/ }));

    await waitFor(() =>
      expect(screen.getByText(/More rows could not be loaded/)).toBeInTheDocument(),
    );
    expect(within(card).getAllByRole("row").length).toBeGreaterThan(1);
  });
});
