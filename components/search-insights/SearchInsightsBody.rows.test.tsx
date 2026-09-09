import * as r from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as v from "vitest";
import * as t from "./SearchInsightsBody.test-helpers";
import { storyQueryRows } from "./search-insights-story-fixtures";

v.describe("SearchInsightsBody", () => {
  v.beforeEach(() => {
    t.analyticsMock().track.mockReset();
  });

  v.it("shows ten of the loaded rows and says how many the window holds", () => {
    t.renderBody();

    const card = t.queriesCard();
    const more = r.within(card).getByRole("button", { name: "Show more" });
    v.expect(
      r.within(more.parentElement as HTMLElement).getByText("10 of 1,284"),
    ).toBeInTheDocument();
    v.expect(r.within(card).getAllByRole("row")).toHaveLength(11);
  });

  v.it("marks a tracked query without asking, and offers Track for the rest", () => {
    t.renderBody();

    const card = t.queriesCard();
    v.expect(r.within(card).getAllByTitle("Already tracked in Rank Tracker")).toHaveLength(2);
    v.expect(r.within(card).getAllByTitle("Add this query to Rank Tracker")).toHaveLength(8);
  });

  v.it("opens the track flow rather than adding a paid check silently", async () => {
    const onTrack = v.vi.fn();
    t.renderBody({ onTrack });

    await userEvent.click(
      r.within(t.queriesCard()).getAllByTitle("Add this query to Rank Tracker")[0],
    );

    v.expect(onTrack).toHaveBeenCalledWith(
      v.expect.objectContaining({ query: storyQueryRows[1].query }),
    );
  });

  v.it(
    "grows to the loaded fifty without asking the server for rows it already holds",
    async () => {
      const loadRowsAction = v.vi.fn();
      t.renderBody({
        loadRowsAction: loadRowsAction as never,
        view: t.view({ queries: { rows: t.queryRows(50), total: 1_284 } }),
      });

      const card = t.queriesCard();
      const more = r.within(card).getByRole("button", { name: /Show more/ });
      v.expect(r.within(card).queryByRole("button", { name: /Show top 10/ })).toBeNull();
      await userEvent.click(more);

      v.expect(loadRowsAction).not.toHaveBeenCalled();
      v.expect(r.within(card).getByText("50 of 1,284")).toBeInTheDocument();
      v.expect(r.within(card).getByRole("button", { name: /Show all/ })).toBeInTheDocument();
      v.expect(r.within(card).getByRole("button", { name: /Show top 10/ })).toBeInTheDocument();
      v.expect(r.within(card).queryByRole("button", { name: /Show more/ })).toBeNull();
      v.expect(card.querySelector("[aria-pressed]")).toBeNull();
    },
  );

  v.it("pages the archived property remainder to the real total", async () => {
    const loadRowsAction = v.vi.fn(async () => ({
      kind: "pages" as const,
      rows: t.pageRows(9),
      total: 59,
    }));
    t.renderBody({
      loadRowsAction: loadRowsAction as never,
      property: "sc-domain:archived.example.com",
      view: t.view({ pages: { rows: t.pageRows(50), total: 59 } }),
    });

    const card = t.pagesCard();
    await userEvent.click(r.within(card).getByRole("button", { name: /Show more/ }));
    await userEvent.click(r.within(card).getByRole("button", { name: /Show all 59/ }));

    await r.waitFor(() => v.expect(r.within(card).getByText("59 of 59")).toBeInTheDocument());
    v.expect(loadRowsAction).toHaveBeenCalledWith({
      kind: "pages",
      limit: 9,
      offset: 50,
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:archived.example.com",
      sort: { direction: "desc", key: "clicks" },
    });
  });

  /**
   * P7c: the tables page a window with LIMIT/OFFSET, so a new order has to be a new read from the
   * first row. Reordering the loaded array would sort the ten rows on screen and leave the other
   * seventy contradicting the counter above them.
   */
  v.it("sends a new sort to the server read and starts again from the first row", async () => {
    const loadRowsAction = v.vi.fn(async () => ({
      kind: "queries" as const,
      rows: t.queryRows(10, "resorted query"),
      total: 80,
      trackedTexts: [],
    }));
    t.renderBody({
      loadRowsAction: loadRowsAction as never,
      view: t.view({ queries: { rows: t.queryRows(10), total: 80 } }),
    });

    await userEvent.click(r.within(t.queriesCard()).getByRole("button", { name: /Impr/ }));

    await r.waitFor(() => v.expect(loadRowsAction).toHaveBeenCalled());
    v.expect(loadRowsAction).toHaveBeenCalledWith({
      kind: "queries",
      limit: 10,
      offset: 0,
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:example.com",
      sort: { direction: "desc", key: "impressions" },
    });
    // The rows on screen are the ones the server sent back for the new order.
    await r.waitFor(() =>
      v.expect(r.within(t.queriesCard()).getByText("resorted query 0")).toBeInTheDocument(),
    );
  });
});
