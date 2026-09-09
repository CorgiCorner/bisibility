import * as r from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as v from "vitest";
import { SearchInsightsDrawerContext } from "./drawers/useDrawerHandlers";
import * as t from "./SearchInsightsBody.test-helpers";
import {
  storyFirstView,
  storyImportFacts,
  storyImportState,
  storySignals,
} from "./search-insights-story-fixtures";

v.describe("SearchInsightsBody", () => {
  v.beforeEach(() => {
    t.analyticsMock().track.mockReset();
  });

  v.it("renders the KPI row, both chips and both tables from stored rows", () => {
    t.renderBody();

    v.expect(r.screen.getByText("12,480")).toBeInTheDocument();
    v.expect(r.screen.getByText("queries at positions 4-20")).toBeInTheDocument();
    v.expect(r.screen.getByText("queries with page overlap")).toBeInTheDocument();
    v.expect(r.screen.getByRole("table", { name: "Top queries" })).toBeInTheDocument();
    v.expect(r.screen.getByRole("table", { name: "Top pages" })).toBeInTheDocument();
    v.expect(r.screen.getByText(/the two tables never sum to the KPI row/)).toBeInTheDocument();
  });

  v.it(
    "renders only the import-waiting reason in both empty cards before the first view is ready",
    () => {
      t.renderBody({
        importState: {
          ...storyImportState,
          facts: {
            ...storyImportFacts,
            readyThrough: {
              ...storyImportFacts.readyThrough,
              d1: { current: false, previous: false },
              d7: { current: false, previous: false },
            },
          },
        },
        view: t.view({
          pages: { rows: [], total: 0 },
          queries: { rows: [], total: 0 },
        }),
      });

      for (const card of [t.queriesCard(), t.pagesCard()]) {
        v.expect(
          r
            .within(card)
            .getByText(
              "Waiting for the first finalized days. Rows appear here after finalized days are imported.",
            ),
        ).toBeInTheDocument();
        v.expect(r.within(card).queryByText("0 of 0")).not.toBeInTheDocument();
        v.expect(r.within(card).queryByRole("table")).not.toBeInTheDocument();
        v.expect(r.within(card).queryByRole("columnheader")).not.toBeInTheDocument();
        v.expect(r.within(card).queryByRole("button")).not.toBeInTheDocument();
      }
      v.expect(
        r.screen.queryByText(/the two tables never sum to the KPI row/),
      ).not.toBeInTheDocument();
      v.expect(r.screen.queryByText(/7 finalized days/)).not.toBeInTheDocument();
    },
  );

  v.it("uses the no-traffic reason once only the first-look day is ready", () => {
    t.renderBody({
      importState: {
        ...storyImportState,
        facts: {
          ...storyImportFacts,
          readyThrough: {
            d1: { current: true, previous: false },
            d7: { current: false, previous: false },
            d28: { current: false, previous: false },
            d90: { current: false, previous: false },
          },
        },
      },
      period: "1",
      view: t.view({
        pages: { rows: [], total: 0 },
        queries: { rows: [], total: 0 },
      }),
    });

    for (const card of [t.queriesCard(), t.pagesCard()]) {
      v.expect(
        r
          .within(card)
          .getByText("Google reported no search traffic for this property in this window."),
      ).toBeInTheDocument();
      v.expect(
        r
          .within(card)
          .queryByText(
            "Waiting for the first finalized days. Rows appear here after finalized days are imported.",
          ),
      ).not.toBeInTheDocument();
    }
  });

  v.it("explains privacy only in an empty queries card when pages have traffic", () => {
    t.renderBody({
      importState: storyImportState,
      view: t.view({ queries: { rows: [], total: 0 } }),
    });

    v.expect(
      r
        .within(t.queriesCard())
        .getByText(
          "Google named no queries in this window. The traffic in Top pages is real - its query text is withheld for privacy.",
        ),
    ).toBeInTheDocument();
    v.expect(r.within(t.queriesCard()).queryByRole("table")).not.toBeInTheDocument();
    v.expect(r.within(t.pagesCard()).getByRole("table", { name: "Top pages" })).toBeInTheDocument();
    v.expect(r.within(t.pagesCard()).queryByText(/withheld for privacy/)).not.toBeInTheDocument();
    v.expect(
      r.screen.queryByText(/the two tables never sum to the KPI row/),
    ).not.toBeInTheDocument();
  });

  v.it("uses the no-traffic reason in both empty cards once the window is covered", () => {
    t.renderBody({
      importState: storyImportState,
      view: t.view({
        pages: { rows: [], total: 0 },
        queries: { rows: [], total: 0 },
      }),
    });

    for (const card of [t.queriesCard(), t.pagesCard()]) {
      v.expect(
        r
          .within(card)
          .getByText("Google reported no search traffic for this property in this window."),
      ).toBeInTheDocument();
      v.expect(r.within(card).queryByText(/privacy/i)).not.toBeInTheDocument();
      v.expect(r.within(card).queryByRole("table")).not.toBeInTheDocument();
      v.expect(r.within(card).queryByRole("columnheader")).not.toBeInTheDocument();
      v.expect(r.within(card).queryByRole("button")).not.toBeInTheDocument();
    }
    v.expect(r.screen.queryByText("0 of 0")).not.toBeInTheDocument();
    v.expect(
      r.screen.queryByText(/the two tables never sum to the KPI row/),
    ).not.toBeInTheDocument();
  });

  v.it("threads the same-view named query total through both signal chip opens", async () => {
    const openList = v.vi.fn();
    r.render(
      <SearchInsightsDrawerContext.Provider
        value={{
          adding: new Set(),
          openList,
          openPage: v.vi.fn(),
          openQuery: v.vi.fn(),
          track: v.vi.fn(),
          tracked: new Set(),
        }}
      >
        {t.body({ view: t.view({ queries: { ...storyFirstView.queries, total: 47 } }) })}
      </SearchInsightsDrawerContext.Provider>,
    );

    await userEvent.click(r.screen.getByRole("button", { name: /queries at positions 4-20/ }));
    await userEvent.click(r.screen.getByRole("button", { name: /queries with page overlap/ }));

    v.expect(openList).toHaveBeenNthCalledWith(1, "band", storySignals.bandCount, 47);
    v.expect(openList).toHaveBeenNthCalledWith(2, "overlap", storySignals.overlapCount, 47);
  });

  v.it("reports the chip kind without sending row data to analytics", async () => {
    t.renderBody();

    await userEvent.click(r.screen.getByRole("button", { name: /queries at positions 4-20/ }));
    await userEvent.click(r.screen.getByRole("button", { name: /queries with page overlap/ }));

    v.expect(t.analyticsMock().track).toHaveBeenCalledWith("search_insights_chip_opened", {
      which: "band",
    });
    v.expect(t.analyticsMock().track).toHaveBeenCalledWith("search_insights_chip_opened", {
      which: "overlap",
    });
  });
});
