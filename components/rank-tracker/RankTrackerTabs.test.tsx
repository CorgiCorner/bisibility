import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankTrackerTabs } from "./RankTrackerTabs";

describe("RankTrackerTabs", () => {
  it("renders tracked, saved, and checks deep links", () => {
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
    expect(screen.getByRole("link", { name: "Checks" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker?tab=checks",
    );
    expect(screen.getByRole("link", { name: "Tracked 248" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("fills the bookmark only while Saved is active and activates Checks independently", () => {
    const { rerender } = render(
      <RankTrackerTabs activeTab="saved" projectRef="prj_1" savedCount={3} trackedCount={10} />,
    );

    expect(screen.getByTestId("saved-tab-icon")).toHaveAttribute("data-weight", "fill");
    expect(screen.getByTestId("saved-tab-icon")).toHaveClass("text-accent-text");

    rerender(
      <RankTrackerTabs activeTab="checks" projectRef="prj_1" savedCount={3} trackedCount={10} />,
    );
    expect(screen.getByTestId("saved-tab-icon")).toHaveAttribute("data-weight", "regular");
    expect(screen.getByTestId("saved-tab-icon")).not.toHaveClass("text-accent-text");
    expect(screen.getByRole("link", { name: "Checks" })).toHaveAttribute("aria-current", "page");
  });
});
