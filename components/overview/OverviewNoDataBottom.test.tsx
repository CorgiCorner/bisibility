import { ViewAllKeywordsButton } from "@/components/overview/OverviewNoDataBottom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("ViewAllKeywordsButton", () => {
  it("renders a serializable anchor to the rank tracker", () => {
    const button = ViewAllKeywordsButton({ projectRef: "prj_abc123" });

    expect(button.props.component).toBe("a");
    expect(button.props.className).toContain("self-end");

    render(button);

    expect(screen.getByRole("link", { name: "View all keywords" })).toHaveAttribute(
      "href",
      "/app/prj_abc123/rank-tracker",
    );
  });
});
