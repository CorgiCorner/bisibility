import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BacklinksPageLoading, BacklinksResultsLoading } from "./BacklinksLoadingSkeletons";

describe("BacklinksLoadingSkeletons", () => {
  it("mirrors the initial backlinks page structure", () => {
    const { container } = render(<BacklinksPageLoading />);

    expect(container.querySelectorAll(".rounded-\\[14px\\]")).toHaveLength(1);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(6);
  });

  it("exposes the result-loading state accessibly", () => {
    render(<BacklinksResultsLoading />);

    expect(screen.getByLabelText("Backlinks loading")).toBeInTheDocument();
  });
});
