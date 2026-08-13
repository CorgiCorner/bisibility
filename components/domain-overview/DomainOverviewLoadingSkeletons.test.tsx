import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DomainOverviewPageLoading,
  DomainOverviewResultsLoading,
} from "./DomainOverviewLoadingSkeletons";

describe("DomainOverviewLoadingSkeletons", () => {
  it("mirrors the complete results hierarchy", () => {
    const { container } = render(<DomainOverviewPageLoading />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(30);
    expect(container.querySelectorAll(".rounded-\\[13px\\]")).toHaveLength(6);
  });

  it("exposes the busy region accessibly", () => {
    render(<DomainOverviewResultsLoading />);
    expect(screen.getByLabelText("Domain Overview loading")).toHaveAttribute("aria-busy", "true");
  });
});
