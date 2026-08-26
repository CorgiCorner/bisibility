import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankTrackerTabs } from "./RankTrackerTabs";

describe("RankTrackerTabs", () => {
  it("renders tracked, saved, and checks deep links", () => {
    render(
      <RankTrackerTabs
        activeTab="tracked"
        checksCount={12_480}
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
    expect(screen.getByText("12.5k")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Checks 12480" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker?tab=checks",
    );
    expect(screen.getByRole("link", { name: "Tracked 248" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks Checks current without decorative tab icons", () => {
    render(
      <RankTrackerTabs
        activeTab="checks"
        checksCount={1_250_000}
        projectRef="prj_1"
        savedCount={3}
        trackedCount={10}
      />,
    );

    expect(screen.getByRole("link", { name: "Checks 1250000" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("navigation", { name: "Rank Tracker views" }).querySelector("svg"),
    ).toBeNull();
  });
});
