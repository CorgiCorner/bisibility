import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankTrackerTabs } from "./RankTrackerTabs";

describe("RankTrackerTabs", () => {
  it("renders only tracked and saved deep links", () => {
    render(
      <RankTrackerTabs activeTab="tracked" projectRef="prj_1" savedCount={36} trackedCount={248} />,
    );

    expect(screen.getByRole("link", { name: "Tracked 248" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker",
    );
    expect(screen.getByRole("link", { name: "Saved 36" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker?tab=saved",
    );
    expect(screen.queryByRole("link", { name: /Runs/u })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tracked 248" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not surface a retired Runs tab for a legacy active value", () => {
    render(
      <RankTrackerTabs activeTab="runs" projectRef="prj_1" savedCount={3} trackedCount={10} />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /Runs/u })).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Rank Tracker views" }).querySelector("svg"),
    ).toBeNull();
  });
});
