import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HighlightLists } from "./HighlightLists";

describe("HighlightLists", () => {
  it("keeps duplicate keyword text distinguishable by market and device", () => {
    render(
      <HighlightLists
        lists={[
          {
            kind: "wins",
            rows: [
              {
                device: "desktop",
                id: "kw_es",
                keyword: "shared keyword",
                marketLanguageLabel: "Spanish",
                marketLocationLabel: "Spain",
                note: "Gained 2",
                positionText: "#3",
              },
              {
                device: "mobile",
                id: "kw_be",
                keyword: "shared keyword",
                marketLanguageLabel: "Dutch",
                marketLocationLabel: "Belgium",
                note: "Gained 1",
                positionText: "#4",
              },
            ],
            subtitle: "Gained the most",
            title: "Biggest wins",
          },
        ]}
        projectRef="prj_1"
      />,
    );

    expect(screen.getByText("Spain")).toBeVisible();
    expect(screen.getByText("/ Spanish")).toBeVisible();
    expect(screen.getByText("Belgium")).toBeVisible();
    expect(screen.getByText("/ Dutch")).toBeVisible();
    expect(screen.getByLabelText("Desktop")).toBeVisible();
    expect(screen.getByLabelText("Mobile")).toBeVisible();
  });

  it("keeps the row height off the chip and hides the chip without a pair", () => {
    render(
      <HighlightLists
        lists={[
          {
            kind: "wins",
            rows: [
              {
                device: "desktop",
                id: "kw_paired",
                keyword: "paired keyword",
                marketLanguageLabel: "Spanish",
                marketLocationLabel: "Spain",
                note: "Gained 2",
                positionText: "#3",
              },
              {
                id: "kw_unpaired",
                keyword: "unpaired keyword",
                note: "First check pending",
                positionText: "No data",
              },
            ],
            subtitle: "Gained the most",
            title: "Biggest wins",
          },
        ]}
        projectRef="prj_1"
      />,
    );

    // The chip is height-pinned and the row keeps its own minimum, so a chip appearing on
    // one row cannot make it taller than a row without one.
    expect(screen.getByText("Spain").parentElement).toHaveClass("h-[22px]");
    for (const row of screen.getAllByRole("link")) {
      expect(row).toHaveClass("min-h-[68px]");
    }
    // Not `queryByText("/ ")`: the default normalizer trims the element text, so that
    // string can never match anything and the assertion would hold with the guard gone.
    const [paired, unpaired] = screen.getAllByRole("link");
    expect(within(paired).getByText("/ Spanish")).toBeVisible();
    expect(within(unpaired).queryByText(/\//)).not.toBeInTheDocument();
    expect(within(unpaired).getByText("unpaired keyword")).toBeVisible();
  });

  it("separates the chip and note with enough vertical rhythm to never overlap", () => {
    render(
      <HighlightLists
        lists={[
          {
            kind: "wins",
            rows: [
              {
                device: "desktop",
                id: "kw_long_url",
                keyword: "a very long keyword that stretches the row width",
                marketLanguageLabel: "Spanish",
                marketLocationLabel: "Malaga, Spain",
                note: "Gained 2 positions since last check",
                positionText: "#3",
              },
            ],
            subtitle: "Gained the most",
            title: "Biggest wins",
          },
        ]}
        projectRef="prj_1"
      />,
    );

    const row = screen.getByRole("link");
    // The row must reserve enough height for all three lines (keyword, chip, note).
    expect(row).toHaveClass("min-h-[68px]");
    // The chip wrapper and the note each use the same mt-1 rhythm token so neither
    // can collapse into the other at any URL or label length.
    const chipWrapper = screen.getByText("Malaga, Spain").closest("span[class*='mt-1']");
    expect(chipWrapper).not.toBeNull();
    const note = screen.getByText("Gained 2 positions since last check");
    expect(note).toHaveClass("mt-1");
    // All three lines are block-level so they stack vertically, never inline.
    expect(screen.getByText("a very long keyword that stretches the row width")).toHaveClass(
      "block",
    );
    expect(note).toHaveClass("block");
  });

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
