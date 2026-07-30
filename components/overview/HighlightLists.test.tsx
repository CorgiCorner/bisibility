import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HighlightLists } from "./HighlightLists";

describe("HighlightLists", () => {
  it("renders comparison and no-match empty states per list", () => {
    render(
      <HighlightLists
        lists={[
          { kind: "wins", rows: [], subtitle: "Gained the most", title: "Biggest wins" },
          {
            kind: "attention",
            rows: [],
            subtitle: "Dropped the most",
            title: "Needs attention",
          },
          {
            kind: "newTop10",
            rows: [],
            subtitle: "Now on page one",
            title: "New in top 10",
          },
          {
            kind: "recentlyAdded",
            rows: [],
            subtitle: "Added recently",
            title: "Recently added",
          },
        ]}
        projectRef="prj_1"
      />,
    );

    expect(screen.getAllByText("Needs another check")).toHaveLength(2);
    expect(screen.getAllByText("No matches")).toHaveLength(2);
    expect(screen.getByText("No keywords were added in the last 7 days.")).toBeInTheDocument();
  });
});
