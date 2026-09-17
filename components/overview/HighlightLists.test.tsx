import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { HighlightLists } from "./HighlightLists";

function renderHighlights(lists: ComponentProps<typeof HighlightLists>["lists"]) {
  return render(
    <ProjectDashboardMessages>
      <HighlightLists lists={lists} projectRef="prj_1" />
    </ProjectDashboardMessages>,
  );
}

describe("HighlightLists", () => {
  it("keeps duplicate keyword text distinguishable by market and device", () => {
    renderHighlights([
      {
        kind: "wins",
        rows: [
          {
            delta: { direction: "up", value: 2 },
            device: "desktop",
            id: "kw_es",
            keyword: "shared keyword",
            marketLanguageLabel: "Spanish",
            marketLocationLabel: "Spain",
            note: { direction: "gained", kind: "movement", url: "/one", value: 2 },
            position: 3,
            positionState: "ranked",
          },
          {
            delta: { direction: "up", value: 1 },
            device: "mobile",
            id: "kw_be",
            keyword: "shared keyword",
            marketLanguageLabel: "Dutch",
            marketLocationLabel: "Belgium",
            note: { direction: "gained", kind: "movement", url: "/two", value: 1 },
            position: 4,
            positionState: "ranked",
          },
        ],
      },
    ]);

    expect(screen.getByText("Spain")).toBeVisible();
    expect(screen.getByText("/ Spanish")).toBeVisible();
    expect(screen.getByText("Belgium")).toBeVisible();
    expect(screen.getByText("/ Dutch")).toBeVisible();
    expect(screen.getByLabelText("Desktop")).toBeVisible();
    expect(screen.getByLabelText("Mobile")).toBeVisible();
  });

  it("renders semantic recent-addition timing and an empty state per list", () => {
    renderHighlights([
      {
        kind: "recentlyAdded",
        rows: [
          {
            id: "kw_new",
            keyword: "new keyword",
            note: {
              age: { kind: "hours", value: 2 },
              checkState: "firstCheckPending",
              kind: "recentlyAdded",
              url: null,
            },
            position: null,
            positionState: "awaitingFirstCheck",
          },
        ],
      },
      { kind: "wins", rows: [] },
    ]);

    expect(screen.getByText("Added 2h ago · first check pending")).toBeVisible();
    expect(screen.getByText("Needs another check")).toBeVisible();
    const recentRow = screen.getByRole("link", { name: /new keyword/i });
    expect(within(recentRow).getByText("Awaiting first check")).toBeVisible();
  });

  it("honors the current attempt state instead of displaying a prior successful rank", () => {
    renderHighlights([
      {
        kind: "attention",
        rows: [
          {
            id: "kw_failed",
            keyword: "failed current check",
            note: { kind: "latestCheckFailed" },
            position: 3,
            positionState: "noData",
            positionTone: "danger",
          },
          {
            id: "kw_unranked",
            keyword: "unranked current check",
            note: { kind: "latestCheckNotRanked" },
            position: 4,
            positionState: "notRanked",
            positionTone: "muted",
          },
        ],
      },
    ]);

    const failed = screen.getByRole("link", { name: /failed current check/i });
    const unranked = screen.getByRole("link", { name: /unranked current check/i });
    expect(within(failed).getByText("No data")).toBeVisible();
    expect(within(unranked).getByText("Not in top 100")).toBeVisible();
    expect(screen.queryByText("#3")).not.toBeInTheDocument();
    expect(screen.queryByText("#4")).not.toBeInTheDocument();
  });

  it("keeps the row height off the chip and hides the chip without a pair", () => {
    renderHighlights([
      {
        kind: "wins",
        rows: [
          {
            id: "kw_paired",
            keyword: "paired keyword",
            marketLanguageLabel: "Spanish",
            marketLocationLabel: "Spain",
            note: { kind: "rankingUrl", url: null },
            position: 3,
            positionState: "ranked",
          },
          {
            id: "kw_unpaired",
            keyword: "unpaired keyword",
            note: { kind: "rankingUrl", url: null },
            position: null,
            positionState: "awaitingFirstCheck",
          },
        ],
      },
    ]);

    expect(screen.getByText("Spain").parentElement).toHaveClass("h-[22px]");
    for (const row of screen.getAllByRole("link")) {
      expect(row).toHaveClass("min-h-[68px]");
    }
    const [paired, unpaired] = screen.getAllByRole("link");
    expect(within(paired).getByText("/ Spanish")).toBeVisible();
    expect(within(unpaired).queryByText(/\//)).not.toBeInTheDocument();
    expect(within(unpaired).getByText("unpaired keyword")).toBeVisible();
  });
});
