import { NEUTRAL_COPY } from "@/components/search-insights/search-insights-copy";
import { handleShellKeyDown } from "@/components/shell/command-keyboard";
import { ToastProvider } from "@/components/ui";
import { DRAWER_LIST_CAP } from "@/lib/search-insights/constants";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  storyBandList,
  storyCostContext,
  storyOverlapList,
  storyPageDetail,
  storyProjectMarkets,
  storyQueryDetail,
} from "./drawer-story-fixtures";
import { SearchInsightsDrawerHost } from "./SearchInsightsDrawerHost";
import { useSearchInsightsDrawerHandlers } from "./useDrawerHandlers";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/client", () => ({ track: mocks.track }));

const actions = {
  addKeywordsAction: vi.fn(),
  loadBandListAction: vi.fn(),
  loadOverlapListAction: vi.fn(),
  loadPageDetailAction: vi.fn(),
  loadQueryDetailAction: vi.fn(),
};

const shellActions = {
  closePalette: vi.fn(),
  togglePalette: vi.fn(),
};

function Openers() {
  const drawers = useSearchInsightsDrawerHandlers();
  return (
    <div>
      <button onClick={() => drawers.openList("band", 33, 1_284)} type="button">
        chip band
      </button>
      <button onClick={() => drawers.openList("overlap", 5, 1_284)} type="button">
        chip overlap
      </button>
      <button onClick={() => drawers.openList("band", 0, 0)} type="button">
        empty band no named
      </button>
      <button onClick={() => drawers.openList("band", 0, 12)} type="button">
        empty band named
      </button>
      <button onClick={() => drawers.openList("overlap", 0, 0)} type="button">
        empty overlap no named
      </button>
      <button onClick={() => drawers.openList("overlap", 0, 12)} type="button">
        empty overlap named
      </button>
      <button onClick={() => drawers.openQuery({ query: "rank tracking software" })} type="button">
        row query
      </button>
      <button onClick={() => drawers.track({ query: "keyword rank checker" })} type="button">
        track other
      </button>
      <button
        onClick={() =>
          drawers.openPage({
            clicks: 0,
            ctr: 0,
            impressions: 0,
            path: "/guides/rank-tracking",
            position: 0,
            sessions: null,
            url: "https://example.com/guides/rank-tracking",
          })
        }
        type="button"
      >
        row page
      </button>
      <table>
        <tbody>
          <tr data-testid="query-row" tabIndex={0}>
            <td>
              {drawers.adding.size > 0 || drawers.tracked.size > 0 ? (
                <span>Adding</span>
              ) : (
                <button
                  onClick={() => drawers.track({ query: "rank tracking software" })}
                  type="button"
                >
                  row track
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <span data-testid="adding">{[...drawers.adding].join(",") || "none"}</span>
      <span data-testid="tracked">{[...drawers.tracked].join(",") || "none"}</span>
    </div>
  );
}

function renderHost(overrides: Partial<typeof actions> = {}, scope: Record<string, string> = {}) {
  return render(
    <div
      onKeyDownCapture={(event) =>
        handleShellKeyDown(event, { ...shellActions, paletteOpen: false })
      }
    >
      <ToastProvider>
        <SearchInsightsDrawerHost
          {...actions}
          {...overrides}
          canCreateKeyword
          costContext={storyCostContext}
          defaultDevice="desktop"
          defaultMarketKey="es-es"
          period="28"
          projectId="prj_1"
          projectMarkets={storyProjectMarkets}
          property="sc-domain:example.com"
          {...scope}
        >
          <Openers />
        </SearchInsightsDrawerHost>
      </ToastProvider>
    </div>,
  );
}

function panel() {
  return screen.getByRole("dialog");
}

function expectNaturalRightAlignedFooter(element: HTMLElement) {
  const footer = element.closest("footer");
  expect(footer).not.toBeNull();
  const alignment = footer?.firstElementChild;
  expect(alignment).toHaveClass("flex", "min-w-0", "justify-end");
  expect(element).not.toHaveClass("flex-1");
  expect(element).not.toHaveStyle({ flex: "1" });
}

describe("SearchInsightsDrawerHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.track.mockReset();
    actions.loadBandListAction.mockResolvedValue(storyBandList);
    actions.loadOverlapListAction.mockResolvedValue(storyOverlapList);
    actions.loadPageDetailAction.mockResolvedValue(storyPageDetail);
    actions.loadQueryDetailAction.mockResolvedValue(storyQueryDetail);
    actions.addKeywordsAction.mockResolvedValue({
      created: 1,
      persistedKeywordCount: 1,
      keywords: [],
      skippedDuplicates: 0,
    });
  });

  it("opens the band list with the chip's own count, its note and its columns", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "chip band" }));

    expect(await screen.findByText("33 queries ranking below the top three")).toBeInTheDocument();
    expect(within(panel()).getByText("Positions 4 to 20")).toBeInTheDocument();
    expect(within(panel()).getByText("Biggest demand first")).toBeInTheDocument();
    expect(within(panel()).getByText(/the work is position, not demand/)).toBeInTheDocument();
    const drawer = panel();
    const queryHeader = within(drawer).getByRole("columnheader", { name: "Query" });
    expect(queryHeader.classList).toContain("text-left");
    expect(queryHeader.classList).not.toContain("text-right");
    for (const label of ["Clicks", "Impr", "Avg pos"]) {
      const header = within(drawer).getByRole("columnheader", { name: label });
      expect(header.classList).toContain("text-right");
      expect(header.classList).not.toContain("text-left");
    }
    expect(actions.loadBandListAction).toHaveBeenCalledWith({
      limit: undefined,
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:example.com",
    });
  });

  it.each([
    {
      button: "empty band no named",
      copy: "Nothing to show yet. This list needs named queries in the window, and Google has named none so far.",
      definition: "This list tracks queries where demand exists but rank can improve.",
      title: "0 queries ranking below the top three",
    },
    {
      button: "empty band named",
      copy: "None of your named queries sit at positions 4 to 20 - everything Google names ranks in the top three.",
      definition: "This list tracks queries where demand exists but rank can improve.",
      title: "0 queries ranking below the top three",
    },
    {
      button: "empty overlap no named",
      copy: "Nothing to show yet. This list needs named queries in the window, and Google has named none so far.",
      definition: "This list tracks queries where more than one of your pages appears.",
      title: "0 queries answered by more than one page",
    },
    {
      button: "empty overlap named",
      copy: "No query is answered by more than one page in this window - no overlap signal.",
      definition: "This list tracks queries where more than one of your pages appears.",
      title: "0 queries answered by more than one page",
    },
  ])("renders the zero state opened by $button", async ({ button, copy, definition, title }) => {
    const user = userEvent.setup();
    actions.loadBandListAction.mockResolvedValue({ rows: [], total: 0 });
    actions.loadOverlapListAction.mockResolvedValue({ rows: [], total: 0 });
    renderHost();

    await user.click(screen.getByRole("button", { name: button }));

    const drawer = panel();
    expect(await within(drawer).findByText(title)).toBeInTheDocument();
    expect(within(drawer).getByText(copy)).toBeInTheDocument();
    expect(within(drawer).getByText(definition)).toBeInTheDocument();
    expect(
      within(drawer).queryByText("Every one of these", { exact: false }),
    ).not.toBeInTheDocument();
    expect(within(drawer).queryByText("Google picks", { exact: false })).not.toBeInTheDocument();
    expect(within(drawer).queryByText("Biggest demand first")).not.toBeInTheDocument();
    expect(within(drawer).queryByText("Most clicks first")).not.toBeInTheDocument();
    expect(within(drawer).queryByText("0 of 0")).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("table")).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("columnheader")).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });

  it("puts the caret in the panel it opened, and hands it back when the panel closes", async () => {
    const user = userEvent.setup();
    renderHost();

    const opener = screen.getByRole("button", { name: "chip band" });
    await user.click(opener);
    await screen.findByText("33 queries ranking below the top three");

    expect(within(panel()).getByRole("button", { name: "Close drawer" })).toHaveFocus();

    await user.click(within(panel()).getByRole("button", { name: "Close drawer" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("keeps Tab and Shift+Tab focus inside the open drawer", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "chip band" }));
    await screen.findByText("33 queries ranking below the top three");

    await user.tab();
    expect(panel()).toContainElement(document.activeElement as HTMLElement | null);
    await user.tab({ shift: true });
    expect(panel()).toContainElement(document.activeElement as HTMLElement | null);
  });

  it("offers a second try when a read fails, rather than an empty panel", async () => {
    const user = userEvent.setup();
    actions.loadOverlapListAction.mockRejectedValueOnce(new Error("gone"));
    renderHost();

    await user.click(screen.getByRole("button", { name: "chip overlap" }));

    await user.click(await within(panel()).findByRole("button", { name: "Try again" }));

    expect(await within(panel()).findByText("Most clicks first")).toBeInTheDocument();
  });

  it("tells two hosts of a domain property apart under the same path", async () => {
    const user = userEvent.setup();
    actions.loadOverlapListAction.mockResolvedValue({
      rows: [
        {
          ...storyOverlapList.rows[0],
          split: [
            { clicks: 214, path: "/pricing", url: "https://www.example.com/pricing" },
            { clicks: 96, path: "/pricing", url: "https://blog.example.com/pricing" },
          ],
        },
      ],
      total: 1,
    });
    renderHost();

    await user.click(screen.getByRole("button", { name: "chip overlap" }));

    const pages = await within(panel()).findAllByTitle(/example\.com\/pricing$/);
    expect(pages.map((page) => page.getAttribute("title"))).toEqual([
      "https://www.example.com/pricing",
      "https://blog.example.com/pricing",
    ]);
  });

  it("proves each overlap with the pages under it", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "chip overlap" }));

    expect(await screen.findByText("5 queries answered by more than one page")).toBeInTheDocument();
    expect(within(panel()).getByText("x3")).toBeInTheDocument();
    expect(within(panel()).getByText("/blog/rank-tracking-2026")).toBeInTheDocument();
  });

  it("reads a query from stored rows and says so under the bars", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row query" }));

    expect(await screen.findByText("rank tracking software")).toBeInTheDocument();
    expect(within(panel()).getByText("Clicks per day")).toBeInTheDocument();
    expect(within(panel()).getByText("28 finalized days")).toBeInTheDocument();
    expect(within(panel()).getByText(NEUTRAL_COPY.storedRows)).toBeInTheDocument();
    expect(within(panel()).getByText("Your pages competing for it")).toBeInTheDocument();
    expect(within(panel()).getByText("7,560")).toBeInTheDocument();
  });

  it("forwards the archived property to every shared drawer read", async () => {
    const user = userEvent.setup();
    renderHost({}, { property: "sc-domain:archived.example.com" });

    await user.click(screen.getByRole("button", { name: "row query" }));
    await screen.findByText("rank tracking software");
    expect(actions.loadQueryDetailAction).toHaveBeenCalledWith({
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
      query: "rank tracking software",
    });

    await user.click(within(panel()).getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "row page" }));
    await within(panel()).findByRole("link", { name: /Open page/ });
    expect(actions.loadPageDetailAction).toHaveBeenCalledWith({
      page: "https://example.com/guides/rank-tracking",
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
    });

    await user.click(within(panel()).getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "chip band" }));
    await screen.findByText("33 queries ranking below the top three");
    expect(actions.loadBandListAction).toHaveBeenCalledWith({
      limit: undefined,
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
    });
  });

  it("marks a direct detail open but not the list that opened it", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row query" }));
    await screen.findByText("rank tracking software");

    expect(
      JSON.parse(window.localStorage.getItem("bisibility:search-insights:visited:prj_1") ?? "[]"),
    ).toEqual(["query:rank tracking software"]);

    await user.click(within(panel()).getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "chip band" }));
    await screen.findByText("33 queries ranking below the top three");

    expect(
      JSON.parse(window.localStorage.getItem("bisibility:search-insights:visited:prj_1") ?? "[]"),
    ).toEqual(["query:rank tracking software"]);
  });

  it("keeps visited slice rows discoverable without a dot beside the position", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row page" }));
    await within(panel()).findByRole("link", { name: /Open page/ });
    await user.click(within(panel()).getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "row query" }));
    const drawer = await screen.findByRole("dialog", { name: "rank tracking software" });
    const row = within(drawer).getByText("/guides/rank-tracking").closest("tr");

    expect(row).toHaveAttribute("data-seen", "1");
    expect(row).toHaveClass("data-[seen=1]:bg-bg-sunken");
    expect(row?.querySelector('[data-seen="1"]')).toBeNull();
    expect(within(row as HTMLElement).queryByTitle("Opened already")).not.toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("#4.2")).toBeInTheDocument();
    expect(row?.querySelector("svg")).not.toBeNull();
  });

  it("keeps visited overlap rows shaded without a dot beside the position", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row query" }));
    await screen.findByRole("dialog", { name: "rank tracking software" });
    await user.click(within(panel()).getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "chip overlap" }));
    const drawer = await screen.findByRole("dialog", {
      name: "5 queries answered by more than one page",
    });
    const row = within(drawer).getByText("rank tracking software").closest("tr");

    expect(row).toHaveAttribute("data-seen", "1");
    expect(row).toHaveClass("data-[seen=1]:bg-bg-sunken");
    expect(row?.querySelector('[data-seen="1"]')).toBeNull();
    expect(within(row as HTMLElement).queryByTitle("Opened already")).not.toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("#5.4")).toBeInTheDocument();
    expect(row?.querySelector("svg")).not.toBeNull();
  });

  it("pushes a frame onto the stack and names what Back returns to", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "chip band" }));
    await screen.findByText("33 queries ranking below the top three");
    await user.click(within(panel()).getByText("keyword position tracker"));

    expect(
      await within(panel()).findByRole("button", { name: /Positions 4 to 20/ }),
    ).toBeInTheDocument();
    expect(actions.loadQueryDetailAction).toHaveBeenCalledWith({
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:example.com",
      query: "keyword position tracker",
    });
    expect(mocks.track).toHaveBeenCalledWith("search_insights_drawer_pivot", {
      from: "band",
      to: "query",
    });
  });

  it("reports a row Track click without including its query", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row track" }));

    expect(mocks.track).toHaveBeenCalledWith("search_insights_track_clicked", { source: "row" });
  });

  it("right-aligns natural-width query, page and status footer actions", async () => {
    const user = userEvent.setup();
    let settle!: (result: {
      created: number;
      persistedKeywordCount: number;
      keywords: never[];
      skippedDuplicates: number;
    }) => void;
    renderHost({
      addKeywordsAction: vi.fn(
        () =>
          new Promise((resolve) => {
            settle = resolve;
          }),
      ),
    });

    await user.click(screen.getByRole("button", { name: "row query" }));
    const track = await within(panel()).findByRole("button", { name: /Track this query/ });
    expectNaturalRightAlignedFooter(track);

    await user.click(within(panel()).getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "row page" }));
    const openPage = await within(panel()).findByRole("link", { name: /Open page/ });
    expectNaturalRightAlignedFooter(openPage);

    await user.click(within(panel()).getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "row query" }));
    const queryDrawer = screen.getByRole("dialog", { name: "rank tracking software" });
    await user.click(within(queryDrawer).getByRole("button", { name: /Track this query/ }));
    await user.click(await screen.findByRole("button", { name: "Use project default: daily" }));
    const adding = await within(queryDrawer).findByText("Adding");
    expectNaturalRightAlignedFooter(adding);

    settle({ created: 1, persistedKeywordCount: 1, keywords: [], skippedDuplicates: 0 });
    await waitFor(() =>
      expect(screen.getByTestId("tracked")).toHaveTextContent("rank tracking software"),
    );
  });

  it("reports a drawer Track click without including its query", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row query" }));
    await user.click(await within(panel()).findByRole("button", { name: /Track this query/ }));

    expect(mocks.track).toHaveBeenCalledWith("search_insights_track_clicked", {
      source: "drawer",
    });
  });

  it("steps Escape back out of the stack before it closes the panel", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "chip band" }));
    await screen.findByText("33 queries ranking below the top three");
    await user.click(within(panel()).getByText("keyword position tracker"));
    await within(panel()).findByRole("button", { name: /Positions 4 to 20/ });

    await user.keyboard("{Escape}");

    expect(await screen.findByText("33 queries ranking below the top three")).toBeInTheDocument();
    expect(panel()).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("leaves the drawer open when the Track dialog consumes Escape", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row query" }));
    const drawer = await screen.findByRole("dialog", { name: "rank tracking software" });
    await user.click(within(drawer).getByRole("button", { name: /Track this query/ }));
    const trackDialog = await screen.findByRole("dialog", { name: /Add to Rank Tracker/ });

    trackDialog.focus();
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /Add to Rank Tracker/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog", { name: "rank tracking software" })).toBeInTheDocument();
  });

  it("reaches the rest of a list without asking for more than one click may build", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "chip band" }));
    await user.click(await within(panel()).findByRole("button", { name: /Show all 33/ }));

    await waitFor(() =>
      expect(actions.loadBandListAction).toHaveBeenLastCalledWith({
        limit: DRAWER_LIST_CAP,
        period: "28",
        projectId: "prj_1",
        property: "sc-domain:example.com",
      }),
    );
  });

  it("says the add is in flight in the panel too, so a second confirm cannot start", async () => {
    const user = userEvent.setup();
    let settle: () => void = () => undefined;
    renderHost({
      addKeywordsAction: vi.fn(
        () =>
          new Promise((resolve) => {
            settle = () =>
              resolve({ created: 1, persistedKeywordCount: 1, keywords: [], skippedDuplicates: 0 });
          }),
      ),
    });

    await user.click(screen.getByRole("button", { name: "row query" }));
    await user.click(await within(panel()).findByRole("button", { name: /Track this query/ }));
    await user.click(await screen.findByRole("button", { name: "Use project default: daily" }));

    await waitFor(() => expect(within(panel()).getByText("Adding")).toBeInTheDocument());
    expect(within(panel()).queryByRole("button", { name: /Track this query/ })).toBeNull();

    settle();

    await waitFor(() =>
      expect(screen.getByTestId("tracked")).toHaveTextContent("rank tracking software"),
    );
  });

  it("offers a page frame the page itself, in a new tab", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row page" }));

    const link = await within(panel()).findByRole("link", { name: /Open page/ });
    expect(link).toHaveAttribute("href", "https://example.com/guides/rank-tracking");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("shows joined organic sessions when a page detail supplies them", async () => {
    const user = userEvent.setup();
    actions.loadPageDetailAction.mockResolvedValue({ ...storyPageDetail, sessions: 42 });
    renderHost();

    await user.click(screen.getByRole("button", { name: "row page" }));

    expect(await within(panel()).findByText("Organic sessions")).toBeInTheDocument();
    expect(within(panel()).getByText("42")).toBeInTheDocument();
  });

  it("never adds silently: the query frame's action opens the confirm dialog", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row query" }));
    await user.click(await within(panel()).findByRole("button", { name: /Track this query/ }));

    expect(await screen.findByText("Add to Rank Tracker")).toBeInTheDocument();
    expect(actions.addKeywordsAction).not.toHaveBeenCalled();
  });

  it("submits weekly Top 20 as the exact keyword schedule", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row track" }));
    await user.click(await screen.findByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("menuitem", { name: "Weekly" }));
    await user.click(screen.getByRole("button", { name: "Search depth" }));
    await user.click(screen.getByRole("menuitem", { name: "Top 20" }));
    await user.click(screen.getByRole("button", { name: "Start tracking weekly" }));

    await waitFor(() =>
      expect(actions.addKeywordsAction).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule: {
            cronExpression: null,
            frequency: "weekly",
            jitterMinutes: 60,
            serpDepth: 20,
            timezone: "UTC",
          },
        }),
      ),
    );
  });

  it("persists changed depth while schedule remains project default", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row track" }));
    await user.click(await screen.findByRole("button", { name: "Search depth" }));
    await user.click(screen.getByRole("menuitem", { name: "Top 20" }));
    await user.click(screen.getByRole("button", { name: "Use project default: daily" }));

    await waitFor(() =>
      expect(actions.addKeywordsAction).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule: expect.objectContaining({ frequency: "daily", serpDepth: 20 }),
        }),
      ),
    );
  });

  it("confirms the project-default schedule and depth in the chosen market", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row query" }));
    await user.click(await within(panel()).findByRole("button", { name: /Track this query/ }));
    await user.click(await screen.findByRole("button", { name: "Use project default: daily" }));

    await waitFor(() =>
      expect(actions.addKeywordsAction).toHaveBeenCalledWith({
        devices: ["desktop"],
        intent: null,
        keywords: ["rank tracking software"],
        locations: [{ locationKey: "es-es" }],
        projectId: "prj_1",
        schedule: expect.objectContaining({ frequency: "daily", serpDepth: 100 }),
        tags: [],
        targetUrl: null,
        topic: null,
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("tracked")).toHaveTextContent("rank tracking software"),
    );
    expect(screen.getByTestId("adding")).toHaveTextContent("none");
  });

  it("hands the caret back to the panel when the add was started there", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row query" }));
    await user.click(await within(panel()).findByRole("button", { name: /Track this query/ }));
    await user.click(await screen.findByRole("button", { name: "Use project default: daily" }));

    await waitFor(() =>
      expect(screen.getByTestId("tracked")).toHaveTextContent("rank tracking software"),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Close drawer" })).toHaveFocus());
  });

  it("hands the caret back to the row when the add was started from the table", async () => {
    const user = userEvent.setup();
    renderHost();

    await user.click(screen.getByRole("button", { name: "row track" }));
    await user.click(await screen.findByRole("button", { name: "Use project default: daily" }));

    await waitFor(() =>
      expect(screen.getByTestId("tracked")).toHaveTextContent("rank tracking software"),
    );
    await waitFor(() => expect(screen.getByTestId("query-row")).toHaveFocus());
  });

  it("keeps each row's own Adding label until that row's write settles", async () => {
    const user = userEvent.setup();
    const settle: Array<(result: unknown) => void> = [];
    const addKeywordsAction = vi.fn();
    addKeywordsAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle.push(resolve);
        }),
    );
    renderHost({ addKeywordsAction });

    await user.click(screen.getByRole("button", { name: "row track" }));
    await user.click(await screen.findByRole("button", { name: "Use project default: daily" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "track other" }));
    await user.click(await screen.findByRole("button", { name: "Use project default: daily" }));

    await waitFor(() =>
      expect(screen.getByTestId("adding")).toHaveTextContent(
        "rank tracking software,keyword rank checker",
      ),
    );
    settle[0]?.({ created: 1, persistedKeywordCount: 1, keywords: [], skippedDuplicates: 0 });

    await waitFor(() =>
      expect(screen.getByTestId("adding").textContent).toBe("keyword rank checker"),
    );
  });

  it("leaves the row untracked when Rank Tracker refuses the write", async () => {
    const user = userEvent.setup();
    renderHost({
      addKeywordsAction: vi.fn().mockRejectedValue(new Error("Add a tracked domain first.")),
    });

    await user.click(screen.getByRole("button", { name: "row query" }));
    await user.click(await within(panel()).findByRole("button", { name: /Track this query/ }));
    await user.click(await screen.findByRole("button", { name: "Use project default: daily" }));

    expect(await screen.findByText("Add a tracked domain first.")).toBeInTheDocument();
    expect(screen.getByTestId("tracked")).toHaveTextContent("none");
  });
});
