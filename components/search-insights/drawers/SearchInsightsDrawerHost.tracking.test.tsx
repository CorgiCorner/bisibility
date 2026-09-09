import * as r from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as v from "vitest";
import * as t from "./SearchInsightsDrawerHost.test-helpers";

const d = t.tools();

v.describe("SearchInsightsDrawerHost", () => {
  v.beforeEach(() => {
    t.resetDrawerHostMocks();
  });

  v.it("reports a drawer Track click without including its query", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    await user.click(await r.within(t.panel()).findByRole("button", { name: /Track this query/ }));

    v.expect(t.analyticsMock().track).toHaveBeenCalledWith("search_insights_track_clicked", {
      source: "drawer",
    });
  });

  v.it("steps Escape back out of the stack before it closes the panel", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "chip band" }));
    await r.screen.findByText("33 queries ranking below the top three");
    await user.click(r.within(t.panel()).getByText("keyword position tracker"));
    await r.within(t.panel()).findByRole("button", { name: /Positions 4 to 20/ });

    await user.keyboard("{Escape}");

    v.expect(
      await r.screen.findByText("33 queries ranking below the top three"),
    ).toBeInTheDocument();
    v.expect(t.panel()).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await r.waitFor(() => v.expect(r.screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  v.it("leaves the drawer open when the Track dialog consumes Escape", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    const drawer = await r.screen.findByRole("dialog", { name: "rank tracking software" });
    await user.click(r.within(drawer).getByRole("button", { name: /Track this query/ }));
    const trackDialog = await r.screen.findByRole("dialog", { name: /Add to Rank Tracker/ });

    trackDialog.focus();
    await user.keyboard("{Escape}");

    await r.waitFor(() =>
      v
        .expect(r.screen.queryByRole("dialog", { name: /Add to Rank Tracker/ }))
        .not.toBeInTheDocument(),
    );
    v.expect(r.screen.getByRole("dialog", { name: "rank tracking software" })).toBeInTheDocument();
  });

  v.it("reaches the rest of a list without asking for more than one click may build", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "chip band" }));
    await user.click(await r.within(t.panel()).findByRole("button", { name: /Show all 33/ }));

    await r.waitFor(() =>
      v.expect(t.actions.loadBandListAction).toHaveBeenLastCalledWith({
        limit: d.DRAWER_LIST_CAP,
        period: "28",
        projectId: "prj_1",
        property: "sc-domain:example.com",
      }),
    );
  });

  v.it("says the add is in flight in the panel too, so a second confirm cannot start", async () => {
    const user = userEvent.setup();
    let settle: () => void = () => undefined;
    t.renderHost({
      addKeywordsAction: v.vi.fn(
        () =>
          new Promise((resolve) => {
            settle = () =>
              resolve({ created: 1, persistedKeywordCount: 1, keywords: [], skippedDuplicates: 0 });
          }),
      ),
    });

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    await user.click(await r.within(t.panel()).findByRole("button", { name: /Track this query/ }));
    await user.click(await r.screen.findByRole("button", { name: "Use project default: daily" }));

    await r.waitFor(() => v.expect(r.within(t.panel()).getByText("Adding")).toBeInTheDocument());
    v.expect(r.within(t.panel()).queryByRole("button", { name: /Track this query/ })).toBeNull();

    settle();

    await r.waitFor(() =>
      v.expect(r.screen.getByTestId("tracked")).toHaveTextContent("rank tracking software"),
    );
  });

  v.it("offers a page frame the page itself, in a new tab", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row page" }));

    const link = await r.within(t.panel()).findByRole("link", { name: /Open page/ });
    v.expect(link).toHaveAttribute("href", "https://example.com/guides/rank-tracking");
    v.expect(link).toHaveAttribute("target", "_blank");
    v.expect(link).toHaveAttribute("rel", v.expect.stringContaining("noopener"));
  });

  v.it("shows joined organic sessions when a page detail supplies them", async () => {
    const user = userEvent.setup();
    t.actions.loadPageDetailAction.mockResolvedValue({ ...d.storyPageDetail, sessions: 42 });
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row page" }));

    v.expect(await r.within(t.panel()).findByText(d.ORGANIC_SESSIONS_LABEL)).toBeInTheDocument();
    v.expect(r.within(t.panel()).getByText("42")).toBeInTheDocument();
  });

  v.it("never adds silently: the query frame's action opens the confirm dialog", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    await user.click(await r.within(t.panel()).findByRole("button", { name: /Track this query/ }));

    v.expect(await r.screen.findByText("Add to Rank Tracker")).toBeInTheDocument();
    v.expect(t.actions.addKeywordsAction).not.toHaveBeenCalled();
  });

  v.it("submits weekly Top 20 as the exact keyword schedule", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row track" }));
    await user.click(await r.screen.findByRole("button", { name: "Schedule" }));
    await user.click(r.screen.getByRole("menuitem", { name: "Weekly" }));
    await user.click(r.screen.getByRole("button", { name: "Search depth" }));
    await user.click(r.screen.getByRole("menuitem", { name: "Top 20" }));
    await user.click(r.screen.getByRole("button", { name: "Start tracking weekly" }));

    await r.waitFor(() =>
      v.expect(t.actions.addKeywordsAction).toHaveBeenCalledWith(
        v.expect.objectContaining({
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

  v.it("persists changed depth while schedule remains project default", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row track" }));
    await user.click(await r.screen.findByRole("button", { name: "Search depth" }));
    await user.click(r.screen.getByRole("menuitem", { name: "Top 20" }));
    await user.click(r.screen.getByRole("button", { name: "Use project default: daily" }));

    await r.waitFor(() =>
      v.expect(t.actions.addKeywordsAction).toHaveBeenCalledWith(
        v.expect.objectContaining({
          schedule: v.expect.objectContaining({ frequency: "daily", serpDepth: 20 }),
        }),
      ),
    );
  });

  v.it("confirms the project-default schedule and depth in the chosen market", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    await user.click(await r.within(t.panel()).findByRole("button", { name: /Track this query/ }));
    await user.click(await r.screen.findByRole("button", { name: "Use project default: daily" }));

    await r.waitFor(() =>
      v.expect(t.actions.addKeywordsAction).toHaveBeenCalledWith({
        devices: ["desktop"],
        intent: null,
        keywords: ["rank tracking software"],
        locations: [{ locationKey: "es-es" }],
        projectId: "prj_1",
        schedule: v.expect.objectContaining({ frequency: "daily", serpDepth: 100 }),
        tags: [],
        targetUrl: null,
        topic: null,
      }),
    );
    await r.waitFor(() =>
      v.expect(r.screen.getByTestId("tracked")).toHaveTextContent("rank tracking software"),
    );
    v.expect(r.screen.getByTestId("adding")).toHaveTextContent("none");
  });

  v.it("hands the caret back to the panel when the add was started there", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    await user.click(await r.within(t.panel()).findByRole("button", { name: /Track this query/ }));
    await user.click(await r.screen.findByRole("button", { name: "Use project default: daily" }));

    await r.waitFor(() =>
      v.expect(r.screen.getByTestId("tracked")).toHaveTextContent("rank tracking software"),
    );
    await r.waitFor(() =>
      v.expect(r.screen.getByRole("button", { name: "Close drawer" })).toHaveFocus(),
    );
  });

  v.it("hands the caret back to the row when the add was started from the table", async () => {
    const user = userEvent.setup();
    t.renderHost();

    await user.click(r.screen.getByRole("button", { name: "row track" }));
    await user.click(await r.screen.findByRole("button", { name: "Use project default: daily" }));

    await r.waitFor(() =>
      v.expect(r.screen.getByTestId("tracked")).toHaveTextContent("rank tracking software"),
    );
    await r.waitFor(() => v.expect(r.screen.getByTestId("query-row")).toHaveFocus());
  });

  v.it("keeps each row's own Adding label until that row's write settles", async () => {
    const user = userEvent.setup();
    const settle: Array<(result: unknown) => void> = [];
    const addKeywordsAction = v.vi.fn();
    addKeywordsAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle.push(resolve);
        }),
    );
    t.renderHost({ addKeywordsAction });

    await user.click(r.screen.getByRole("button", { name: "row track" }));
    await user.click(await r.screen.findByRole("button", { name: "Use project default: daily" }));
    await r.waitFor(() => v.expect(r.screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(r.screen.getByRole("button", { name: "track other" }));
    await user.click(await r.screen.findByRole("button", { name: "Use project default: daily" }));

    await r.waitFor(() =>
      v
        .expect(r.screen.getByTestId("adding"))
        .toHaveTextContent("rank tracking software,keyword rank checker"),
    );
    settle[0]?.({ created: 1, persistedKeywordCount: 1, keywords: [], skippedDuplicates: 0 });

    await r.waitFor(() =>
      v.expect(r.screen.getByTestId("adding").textContent).toBe("keyword rank checker"),
    );
  });

  v.it("leaves the row untracked when Rank Tracker refuses the write", async () => {
    const user = userEvent.setup();
    t.renderHost({
      addKeywordsAction: v.vi.fn().mockRejectedValue(new Error("Add a tracked domain first.")),
    });

    await user.click(r.screen.getByRole("button", { name: "row query" }));
    await user.click(await r.within(t.panel()).findByRole("button", { name: /Track this query/ }));
    await user.click(await r.screen.findByRole("button", { name: "Use project default: daily" }));

    v.expect(await r.screen.findByText("Add a tracked domain first.")).toBeInTheDocument();
    v.expect(r.screen.getByTestId("tracked")).toHaveTextContent("none");
  });
});
