import * as r from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as v from "vitest";
import * as t from "./SearchInsightsBody.test-helpers";

v.describe("SearchInsightsBody", () => {
  v.beforeEach(() => {
    t.analyticsMock().track.mockReset();
  });

  v.it("walks the server pages with the table footer", async () => {
    const loadRowsAction = v.vi.fn(async (input: { offset: number }) => ({
      kind: "queries" as const,
      rows: t.queryRows(10, `page at ${input.offset}`),
      total: 80,
      trackedTexts: [],
    }));
    t.renderBody({
      loadRowsAction: loadRowsAction as never,
      view: t.view({ queries: { rows: t.queryRows(10), total: 80 } }),
    });

    const card = t.queriesCard();
    v.expect(r.within(card).getByText("1-10 of 80")).toBeInTheDocument();
    v.expect(r.within(card).getByRole("button", { name: "Previous page" })).toBeDisabled();

    await userEvent.click(r.within(card).getByRole("button", { name: "Next page" }));

    await r.waitFor(() => v.expect(r.within(card).getByText("page at 10 0")).toBeInTheDocument());
    v.expect(r.within(card).getByText("11-20 of 80")).toBeInTheDocument();
    v.expect(r.within(card).queryByText("stored query 0")).toBeNull();
    v.expect(r.within(card).getAllByRole("row")).toHaveLength(11);
  });

  v.it("sends the search to the server and says when nothing matches", async () => {
    const loadRowsAction = v.vi.fn(async () => ({
      kind: "pages" as const,
      rows: [],
      total: 0,
    }));
    t.renderBody({ loadRowsAction: loadRowsAction as never });

    const card = t.pagesCard();
    await userEvent.type(r.within(card).getByRole("searchbox", { name: "Search pages" }), "zzz");

    await r.waitFor(() =>
      v
        .expect(loadRowsAction)
        .toHaveBeenCalledWith(
          v.expect.objectContaining({ kind: "pages", offset: 0, search: "zzz" }),
        ),
    );
    v.expect(loadRowsAction).toHaveBeenCalledTimes(1);
    await r.waitFor(() =>
      v.expect(r.within(card).getByText('No rows match "zzz".')).toBeInTheDocument(),
    );
    // The card still holds the search box: the window has rows, only this search found none.
    v.expect(r.within(card).getByRole("searchbox", { name: "Search pages" })).toHaveValue("zzz");
  });

  v.it("keeps each table's busy state on its own request", async () => {
    let releaseQueries = () => {};
    const held = new Promise<void>((resolve) => {
      releaseQueries = resolve;
    });
    const loadRowsAction = v.vi.fn(async (input: { kind: "pages" | "queries" }) => {
      if (input.kind === "pages") {
        return { kind: "pages" as const, rows: t.pageRows(10), total: 51 };
      }
      await held;
      return {
        kind: "queries" as const,
        rows: t.queryRows(10, "paged query"),
        total: 51,
        trackedTexts: [],
      };
    });
    t.renderBody({
      loadRowsAction: loadRowsAction as never,
      view: t.view({
        pages: { rows: t.pageRows(10), total: 51 },
        queries: { rows: t.queryRows(10), total: 51 },
      }),
    });

    const queries = t.queriesCard();
    const pages = t.pagesCard();
    r.fireEvent.click(r.within(queries).getByRole("button", { name: "Next page" }));
    r.fireEvent.click(r.within(pages).getByRole("button", { name: "Next page" }));

    // The pages settled first; the queries request is still out, so only that table stays busy.
    await r.waitFor(() =>
      v.expect(r.within(pages).getByRole("table")).not.toHaveAttribute("aria-busy"),
    );
    v.expect(r.within(queries).getByRole("table")).toHaveAttribute("aria-busy", "true");

    await r.act(async () => releaseQueries());
    v.expect(r.within(queries).getByRole("table")).not.toHaveAttribute("aria-busy");
    v.expect(r.within(queries).getByText("paged query 0")).toBeInTheDocument();
  });

  v.it("keeps the table usable when a page of rows cannot be loaded", async () => {
    // A rejection with nothing user-safe in it falls back to the module's own sentence.
    const loadRowsAction = v.vi.fn(async () => {
      throw new Error("");
    });
    t.renderBody({
      loadRowsAction: loadRowsAction as never,
      view: t.view({ queries: { rows: t.queryRows(10), total: 80 } }),
    });

    const card = t.queriesCard();
    await userEvent.click(r.within(card).getByRole("button", { name: "Next page" }));

    await r.waitFor(() =>
      v.expect(r.screen.getByText(/More rows could not be loaded/)).toBeInTheDocument(),
    );
    v.expect(r.within(card).getByText("1-10 of 80")).toBeInTheDocument();
    v.expect(r.within(card).getByText("stored query 0")).toBeInTheDocument();
  });
});
