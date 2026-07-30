import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResearchPageLoading, ResearchResultsLoading } from "./ResearchLoadingSkeletons";

describe("ResearchLoadingSkeletons", () => {
  it("mirrors the initial research page structure", () => {
    const { container } = render(<ResearchPageLoading />);

    expect(container.querySelectorAll(".rounded-\\[14px\\]")).toHaveLength(2);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(10);
  });

  it("exposes the result-loading state accessibly", () => {
    render(<ResearchResultsLoading />);

    expect(screen.getByLabelText("Research loading")).toBeInTheDocument();
  });
});
