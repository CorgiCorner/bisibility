import * as r from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as v from "vitest";
import * as t from "./SearchInsightsDrawerHost.test-helpers";

const d = t.tools();

v.describe("SearchInsightsDrawerHost", () => {
  v.beforeEach(() => {
    t.resetDrawerHostMocks();
  });

  v.it("proves each overlap with the pages under it", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "chip overlap" }));

    v.expect(
      await r.screen.findByText("5 queries answered by more than one page"),
    ).toBeInTheDocument();
    v.expect(r.within(t.panel()).getByText("x3")).toBeInTheDocument();
    v.expect(r.within(t.panel()).getByText("/blog/rank-tracking-2026")).toBeInTheDocument();
  });

  v.it("reads a query from stored rows and says so under the bars", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row query" }));

    v.expect(await r.screen.findByText("rank tracking software")).toBeInTheDocument();
    v.expect(r.within(t.panel()).getByText("Clicks per day")).toBeInTheDocument();
    v.expect(r.within(t.panel()).getByText("28 finalized days")).toBeInTheDocument();
    v.expect(r.within(t.panel()).getByText(d.NEUTRAL_COPY.storedRows)).toBeInTheDocument();
    v.expect(r.within(t.panel()).getByText("Your pages competing for it")).toBeInTheDocument();
    v.expect(r.within(t.panel()).getByText("7,560")).toBeInTheDocument();
  });

  v.it("forwards the archived property to every shared drawer read", async () => {
    const user = userEvent.setup();
    t.renderHost({}, { property: "sc-domain:archived.example.com" });

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    await r.screen.findByText("rank tracking software");
    v.expect(t.actions.loadQueryDetailAction).toHaveBeenCalledWith({
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
      query: "rank tracking software",
    });

    await user.click(r.within(t.panel()).getByRole("button", { name: "Close drawer" }));
    await r.waitFor(() => v.expect(r.screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(r.screen.getByRole("button", { name: "row page" }));
    await r.within(t.panel()).findByRole("link", { name: /Open page/ });
    v.expect(t.actions.loadPageDetailAction).toHaveBeenCalledWith({
      page: "https://example.com/guides/rank-tracking",
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
    });

    await user.click(r.within(t.panel()).getByRole("button", { name: "Close drawer" }));
    await r.waitFor(() => v.expect(r.screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(r.screen.getByRole("button", { name: "chip band" }));
    await r.screen.findByText("33 queries ranking below the top three");
    v.expect(t.actions.loadBandListAction).toHaveBeenCalledWith({
      limit: undefined,
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
    });
  });

  v.it("marks a direct detail open but not the list that opened it", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    await r.screen.findByText("rank tracking software");

    v.expect(
      JSON.parse(window.localStorage.getItem("bisibility:search-insights:visited:prj_1") ?? "[]"),
    ).toEqual(["query:rank tracking software"]);

    await user.click(r.within(t.panel()).getByRole("button", { name: "Close drawer" }));
    await r.waitFor(() => v.expect(r.screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(r.screen.getByRole("button", { name: "chip band" }));
    await r.screen.findByText("33 queries ranking below the top three");

    v.expect(
      JSON.parse(window.localStorage.getItem("bisibility:search-insights:visited:prj_1") ?? "[]"),
    ).toEqual(["query:rank tracking software"]);
  });

  v.it("keeps visited slice rows discoverable without a dot beside the position", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row page" }));
    await r.within(t.panel()).findByRole("link", { name: /Open page/ });
    await user.click(r.within(t.panel()).getByRole("button", { name: "Close drawer" }));
    await r.waitFor(() => v.expect(r.screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    const drawer = await r.screen.findByRole("dialog", { name: "rank tracking software" });
    const row = r.within(drawer).getByText("/guides/rank-tracking").closest('[role="row"]');

    v.expect(row).toHaveClass("!bg-bg-sunken");
    v.expect(row).not.toHaveAttribute("data-seen");
    v.expect(r.within(row as HTMLElement).queryByTitle("Opened already")).not.toBeInTheDocument();
    v.expect(r.within(row as HTMLElement).getByText("#4.2")).toBeInTheDocument();
    v.expect(row?.querySelector("svg")).not.toBeNull();
  });

  v.it("keeps visited overlap rows shaded without a dot beside the position", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    await r.screen.findByRole("dialog", { name: "rank tracking software" });
    await user.click(r.within(t.panel()).getByRole("button", { name: "Close drawer" }));
    await r.waitFor(() => v.expect(r.screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(r.screen.getByRole("button", { name: "chip overlap" }));
    const drawer = await r.screen.findByRole("dialog", {
      name: "5 queries answered by more than one page",
    });
    const row = r.within(drawer).getByText("rank tracking software").closest('[role="row"]');

    v.expect(row).toHaveClass("!bg-bg-sunken");
    v.expect(row).not.toHaveAttribute("data-seen");
    v.expect(r.within(row as HTMLElement).queryByTitle("Opened already")).not.toBeInTheDocument();
    v.expect(r.within(row as HTMLElement).getByText("#5.4")).toBeInTheDocument();
    v.expect(row?.querySelector("svg")).not.toBeNull();
  });

  v.it("pushes a frame onto the stack and names what Back returns to", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "chip band" }));
    await r.screen.findByText("33 queries ranking below the top three");
    await user.click(r.within(t.panel()).getByText("keyword position tracker"));

    v.expect(
      await r.within(t.panel()).findByRole("button", { name: /Positions 4 to 20/ }),
    ).toBeInTheDocument();
    v.expect(t.actions.loadQueryDetailAction).toHaveBeenCalledWith({
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:example.com",
      query: "keyword position tracker",
    });
    v.expect(t.analyticsMock().track).toHaveBeenCalledWith("search_insights_drawer_pivot", {
      from: "band",
      to: "query",
    });
  });

  v.it("reports a row Track click without including its query", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row track" }));

    v.expect(t.analyticsMock().track).toHaveBeenCalledWith("search_insights_track_clicked", {
      source: "row",
    });
  });

  v.it("loads the Track dialog payload only on first open", async () => {
    const user = userEvent.setup();
    let settle!: (payload: {
      costContext: typeof d.storyCostContext;
      defaultDevice: "desktop";
      defaultMarketKey: string;
      projectMarkets: typeof d.storyProjectMarkets;
    }) => void;
    t.actions.loadTrackDialogAction.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    t.renderHost();

    v.expect(t.actions.loadTrackDialogAction).not.toHaveBeenCalled();
    await user.click(r.screen.getByRole("button", { name: "row track" }));
    v.expect(r.screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    v.expect(t.actions.loadTrackDialogAction).toHaveBeenCalledWith({ projectId: "prj_1" });

    settle({
      costContext: d.storyCostContext,
      defaultDevice: "desktop",
      defaultMarketKey: "es-es",
      projectMarkets: d.storyProjectMarkets,
    });
    v.expect(
      await r.screen.findByRole("button", { name: "Use project default: daily" }),
    ).toBeVisible();
  });

  v.it("right-aligns natural-width query, page and status footer actions", async () => {
    const user = userEvent.setup();
    let settle!: (result: {
      created: number;
      persistedKeywordCount: number;
      keywords: never[];
      skippedDuplicates: number;
    }) => void;
    t.renderHost({
      addKeywordsAction: v.vi.fn(
        () =>
          new Promise((resolve) => {
            settle = resolve;
          }),
      ),
    });

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    const track = await r.within(t.panel()).findByRole("button", { name: /Track this query/ });
    t.expectNaturalRightAlignedFooter(track);

    await user.click(r.within(t.panel()).getByRole("button", { name: "Close drawer" }));
    await r.waitFor(() => v.expect(r.screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(r.screen.getByRole("button", { name: "row page" }));
    const openPage = await r.within(t.panel()).findByRole("link", { name: /Open page/ });
    t.expectNaturalRightAlignedFooter(openPage);

    await user.click(r.within(t.panel()).getByRole("button", { name: "Close drawer" }));
    await r.waitFor(() => v.expect(r.screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(r.screen.getByRole("button", { name: "row query" }));
    const queryDrawer = r.screen.getByRole("dialog", { name: "rank tracking software" });
    await user.click(r.within(queryDrawer).getByRole("button", { name: /Track this query/ }));
    await user.click(await r.screen.findByRole("button", { name: "Use project default: daily" }));
    const adding = await r.within(queryDrawer).findByText("Adding");
    t.expectNaturalRightAlignedFooter(adding);

    settle({ created: 1, persistedKeywordCount: 1, keywords: [], skippedDuplicates: 0 });
    await r.waitFor(() =>
      v.expect(r.screen.getByTestId("tracked")).toHaveTextContent("rank tracking software"),
    );
  });
});
