import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResearchPageLoading, ResearchResultsLoading } from "./ResearchLoadingSkeletons";

describe("ResearchLoadingSkeletons", () => {
  it("mirrors the initial research page structure", () => {
    const { container } = render(<ResearchPageLoading />);

    expect(container.querySelectorAll(".rounded-card")).toHaveLength(2);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(10);
  });

  it("uses the standard border on the idle-state loading surface", () => {
    const { container } = render(<ResearchPageLoading />);

    const idleStateLoadingSurface = container.firstElementChild?.children.item(1);
    expect(idleStateLoadingSurface).toHaveClass("border-border");
    expect(idleStateLoadingSurface).not.toHaveClass("border-border-control");
  });

  it("exposes the result-loading state accessibly", () => {
    render(<ResearchResultsLoading />);

    expect(screen.getByLabelText("Research loading")).toBeInTheDocument();
  });
});
