import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordsTabs } from "./KeywordsTabs";

describe("KeywordsTabs", () => {
  it("renders tracked and saved counts with client-side deep links", () => {
    render(
      <KeywordsTabs activeTab="tracked" projectRef="prj_1" savedCount={36} trackedCount={248} />,
    );

    expect(screen.getByRole("link", { name: "Tracked 248" })).toHaveAttribute(
      "href",
      "/app/prj_1/keywords",
    );
    expect(screen.getByRole("link", { name: "Saved 36" })).toHaveAttribute(
      "href",
      "/app/prj_1/keywords?tab=saved",
    );
    expect(screen.getByRole("link", { name: "Tracked 248" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("fills and accents the bookmark only while Saved is active", () => {
    const { rerender } = render(
      <KeywordsTabs activeTab="saved" projectRef="prj_1" savedCount={3} trackedCount={10} />,
    );

    expect(screen.getByTestId("saved-tab-icon")).toHaveAttribute("data-weight", "fill");
    expect(screen.getByTestId("saved-tab-icon")).toHaveClass("text-accent");

    rerender(
      <KeywordsTabs activeTab="tracked" projectRef="prj_1" savedCount={3} trackedCount={10} />,
    );
    expect(screen.getByTestId("saved-tab-icon")).toHaveAttribute("data-weight", "regular");
    expect(screen.getByTestId("saved-tab-icon")).not.toHaveClass("text-accent");
  });
});
