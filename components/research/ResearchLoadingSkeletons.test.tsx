import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResearchPageLoading, ResearchResultsLoading } from "./ResearchLoadingSkeletons";

describe("ResearchLoadingSkeletons", () => {
  it("mirrors the initial research page structure", () => {
    const { container } = render(<ResearchPageLoading />);

    expect(container.querySelectorAll(".rounded-\\[14px\\]")).toHaveLength(2);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(10);
  });

  it("idle loading card uses a solid border without border-dashed", () => {
    const { container } = render(<ResearchPageLoading />);

    const idleCard = container.querySelector(".min-h-\\[258px\\]");
    expect(idleCard).not.toBeNull();
    const className = idleCard?.className ?? "";
    expect(className).not.toContain("border-dashed");
    expect(className).toContain("border");
    expect(className).toContain("border-border-strong");
  });

  it("exposes the result-loading state accessibly", () => {
    render(<ResearchResultsLoading />);

    expect(screen.getByLabelText("Research loading")).toBeInTheDocument();
  });
});
