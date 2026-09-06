import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankTrackerTabs } from "./RankTrackerTabs";

describe("RankTrackerTabs", () => {
  it("renders tracked, saved, and runs deep links", () => {
    render(
      <RankTrackerTabs
        activeTab="tracked"
        runsCount={1_248}
        projectRef="prj_1"
        savedCount={36}
        trackedCount={248}
      />,
    );

    expect(screen.getByRole("link", { name: "Tracked 248" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker",
    );
    expect(screen.getByRole("link", { name: "Saved 36" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker?tab=saved",
    );
    expect(screen.getByText("1.2k")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runs 1248" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker?tab=runs",
    );
    expect(screen.getByRole("link", { name: "Tracked 248" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks Runs current without decorative tab icons", () => {
    render(
      <RankTrackerTabs
        activeTab="runs"
        runsCount={1_250_000}
        projectRef="prj_1"
        savedCount={3}
        trackedCount={10}
      />,
    );

    expect(screen.getByRole("link", { name: "Runs 1250000" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("navigation", { name: "Rank Tracker views" }).querySelector("svg"),
    ).toBeNull();
  });
});
