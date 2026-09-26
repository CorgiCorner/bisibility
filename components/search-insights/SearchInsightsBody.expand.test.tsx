import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import * as t from "./SearchInsightsBody.test-helpers";

describe("SearchInsightsBody expand", () => {
  it("offers an expand button on both cards and hides it on an empty card", () => {
    t.renderBody({
      view: t.view({ pages: { rows: [], total: 0 } }),
    });

    expect(screen.getByRole("button", { name: "Expand Top queries" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand Top pages" })).toBeNull();
  });

  it("opens the same search value and sorted rows in the full-screen modal", async () => {
    const user = userEvent.setup();
    t.renderBody();

    const inlineSearch = document.getElementById("search-insights-queries-search") as HTMLElement;
    await user.type(inlineSearch, "rank");

    await user.click(screen.getByRole("button", { name: "Expand Top queries" }));

    const dialog = screen.getByRole("dialog");
    const expandedSearch = within(dialog).getByRole("searchbox", {
      name: "Search queries",
    }) as HTMLInputElement;
    expect(expandedSearch.id).toBe("search-insights-queries-search-expanded");
    expect(expandedSearch.value).toBe("rank");
    // Both tables read one parent state, so the rows match.
    expect(within(dialog).getByRole("table", { name: "Top queries" })).toBeInTheDocument();
  });

  it("keeps the inline search in step when the expanded search changes", async () => {
    const user = userEvent.setup();
    t.renderBody();

    await user.click(screen.getByRole("button", { name: "Expand Top queries" }));
    const dialog = screen.getByRole("dialog");
    const expandedSearch = within(dialog).getByRole("searchbox", { name: "Search queries" });
    await user.type(expandedSearch, "seo");

    const inlineSearch = document.getElementById(
      "search-insights-queries-search",
    ) as HTMLInputElement;
    expect(inlineSearch.value).toBe("seo");
  });
});
