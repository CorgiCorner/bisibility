import * as r from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as v from "vitest";
import * as t from "./SearchInsightsBody.test-helpers";

v.describe("SearchInsightsBody", () => {
  v.beforeEach(() => {
    t.analyticsMock().track.mockReset();
  });

  v.it(
    "pages a sorted window without repeating or dropping a row",
    async () => {
      v.vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
      v.vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(640);
      v.vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(520);
      const sorted = t.queryRows(80, "sorted query");
      const nextPage = t.deferred<t.RowsPageOutcome>();
      const loadRowsAction = v.vi.fn(() => nextPage.promise);
      t.renderBody({
        loadRowsAction: loadRowsAction as never,
        view: t.view({ queries: { rows: sorted.slice(0, 50), total: 80 } }),
      });

      const card = t.queriesCard();
      r.fireEvent.click(r.within(card).getByRole("button", { name: /Show more/ }));
      v.expect(r.within(card).getByText("50 of 80")).toBeInTheDocument();
      r.fireEvent.click(r.within(card).getByRole("button", { name: /Show all 80/ }));

      await r.act(async () => {
        nextPage.resolve({
          kind: "queries",
          rows: sorted.slice(50),
          total: 80,
          trackedTexts: [],
        });
      });
      v.expect(r.within(card).getByText("80 of 80")).toBeInTheDocument();

      // The expanded table virtualizes, so the boundary between the two pages is asserted where it
      // actually falls: scrolled to row 50, the band must read as one contiguous run of the window.
      const table = r.within(card).getByRole("table", { name: "Top queries" });
      table.scrollTop = 56 * 40;
      r.fireEvent.scroll(table);

      const shown = r
        .within(r.within(table).getByTestId("search-insights-queries-body"))
        .getAllByRole("row")
        .map((row) => row.firstElementChild?.textContent ?? "")
        .filter((text) => text.startsWith("sorted query"));
      const first = sorted.findIndex((row) => row.query === shown[0]);
      v.expect(first).toBeGreaterThanOrEqual(0);
      // Contiguous, in order, and spanning the page boundary at row 50.
      v.expect(shown).toEqual(sorted.slice(first, first + shown.length).map((row) => row.query));
      v.expect(new Set(shown).size).toBe(shown.length);
      v.expect(first).toBeLessThan(50);
      v.expect(first + shown.length).toBeGreaterThan(50);
    },
    15_000,
  );

  v.it("pages the rest of the window in, then lets the counter collapse it again", async () => {
    const loadRowsAction = v.vi.fn(async () => ({
      kind: "queries" as const,
      rows: t.queryRows(30, "paged query"),
      total: 80,
      trackedTexts: [],
    }));
    t.renderBody({
      loadRowsAction: loadRowsAction as never,
      view: t.view({ queries: { rows: t.queryRows(50), total: 80 } }),
    });

    const card = t.queriesCard();
    r.fireEvent.click(r.within(card).getByRole("button", { name: /Show more/ }));
    r.fireEvent.click(r.within(card).getByRole("button", { name: /Show all 80/ }));

    await r.act(async () => {
      await Promise.resolve(loadRowsAction.mock.results[0]?.value);
    });
    v.expect(r.within(card).getByText("80 of 80")).toBeInTheDocument();
    // Only the rows the window still owes, never a full page past the end of it.
    v.expect(loadRowsAction).toHaveBeenCalledWith({
      kind: "queries",
      limit: 30,
      offset: 50,
      period: "28",
      projectId: "prj_1",
      property: "sc-domain:example.com",
      sort: { direction: "desc", key: "clicks" },
    });

    await userEvent.click(r.within(card).getByTitle("Back to the top 10 rows"));
    v.expect(r.within(card).getByText("10 of 80")).toBeInTheDocument();
  });

  v.it("keeps each table's spinner on its own request", async () => {
    let releaseQueries = () => {};
    const held = new Promise<void>((resolve) => {
      releaseQueries = resolve;
    });
    const loadRowsAction = v.vi.fn(
      async (input: { kind: "pages" | "queries"; limit: number; offset: number }) => {
        if (input.kind === "pages") {
          return {
            kind: "pages" as const,
            rows: t.pageRows(input.limit).map((row, index) => ({
              ...row,
              path: `/guide/${input.offset + index}`,
              url: `https://example.com/guide/${input.offset + index}`,
            })),
            total: 51,
          };
        }
        await held;
        return {
          kind: "queries" as const,
          rows: t.queryRows(41, "paged query"),
          total: 51,
          trackedTexts: [],
        };
      },
    );
    t.renderBody({
      loadRowsAction: loadRowsAction as never,
      view: t.view({
        pages: { rows: t.pageRows(10), total: 51 },
        queries: { rows: t.queryRows(10), total: 51 },
      }),
    });

    const queries = t.queriesCard();
    const pages = t.pagesCard();
    r.fireEvent.click(r.within(queries).getByRole("button", { name: /Show more/ }));
    r.fireEvent.click(r.within(queries).getByRole("button", { name: /Show all 51/ }));
    r.fireEvent.click(r.within(pages).getByRole("button", { name: /Show more/ }));
    r.fireEvent.click(r.within(pages).getByRole("button", { name: /Show all 51/ }));

    // The pages settled first; the queries request is still out, so its control stays busy.
    await r.waitFor(() => v.expect(r.within(pages).getByText("51 of 51")).toBeInTheDocument());
    v.expect(r.within(queries).getByRole("button", { name: /Show all 51/ })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    await r.act(async () => releaseQueries());
    v.expect(r.within(queries).getByText("51 of 51")).toBeInTheDocument();
  });

  v.it("keeps the table usable when a page of rows cannot be loaded", async () => {
    // A rejection with nothing user-safe in it falls back to the module's own sentence.
    const loadRowsAction = v.vi.fn(async () => {
      throw new Error("");
    });
    t.renderBody({
      loadRowsAction: loadRowsAction as never,
      view: t.view({ queries: { rows: t.queryRows(50), total: 80 } }),
    });

    const card = t.queriesCard();
    await userEvent.click(r.within(card).getByRole("button", { name: /Show more/ }));
    await userEvent.click(r.within(card).getByRole("button", { name: /Show all 80/ }));

    await r.waitFor(() =>
      v.expect(r.screen.getByText(/More rows could not be loaded/)).toBeInTheDocument(),
    );
    v.expect(r.within(card).getAllByRole("row").length).toBeGreaterThan(1);
  });
});
