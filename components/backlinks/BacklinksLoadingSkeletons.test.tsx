import { renderWithBacklinksMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BacklinksPageLoading, BacklinksResultsLoading } from "./BacklinksLoadingSkeletons";

describe("BacklinksLoadingSkeletons", () => {
  it("mirrors the initial backlinks workspace and analyze-card geometry", () => {
    const { container } = render(<BacklinksPageLoading />);
    const pageContent = container.firstElementChild;
    const workspace = screen.getByTestId("backlinks-workspace-loading");
    const analyzeCard = screen.getByTestId("backlinks-analyze-loading");
    const form = analyzeCard?.firstElementChild;
    const firstRow = form?.firstElementChild;
    const lowerRow = form?.lastElementChild;
    const target = firstRow?.children[0];
    const scope = firstRow?.children[1];
    const limit = firstRow?.children[2];
    const submitGroup = lowerRow?.lastElementChild;
    const submit = submitGroup?.lastElementChild;

    expect(pageContent).toHaveClass("w-full", "min-w-0");
    expect(workspace).toHaveClass("grid", "min-w-0", "gap-4");
    expect(workspace?.tagName).toBe("SECTION");
    expect(analyzeCard).toHaveClass(
      "rounded-card",
      "border",
      "border-border",
      "bg-bg-elev",
      "p-4",
      "sm:p-5",
    );
    expect(form).toHaveClass("grid", "gap-3");
    expect(firstRow).toHaveClass("flex", "flex-col", "gap-3", "md:flex-row", "md:items-start");
    expect(target).toHaveClass(
      "min-h-9",
      "sm:min-h-[34px]",
      "flex-1",
      "rounded-control",
      "border",
      "border-border",
      "md:min-w-[240px]",
    );
    expect(scope).toHaveClass("h-[34px]", "md:w-[196px]");
    expect(limit).toHaveClass("min-h-[34px]", "lg:w-[132px]");
    expect(lowerRow).toHaveClass("flex", "flex-wrap", "items-center", "justify-between", "gap-3");
    expect(submitGroup).toHaveClass("flex", "items-center", "gap-4");
    expect(submit).toHaveClass("min-w-[216px]");
  });

  it("uses real static idle guidance without exposing active controls during loading", () => {
    const { container } = render(<BacklinksPageLoading />);
    expect(container.querySelector("[data-empty-state]")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-empty-state-bullet]")).toHaveLength(3);
    expect(container.querySelector("input,button,a")).toBeNull();
  });

  it("exposes the result-loading state accessibly", () => {
    const { container } = render(<BacklinksResultsLoading />);

    expect(screen.getByLabelText("Backlinks loading")).toBeInTheDocument();
    expect(container.querySelector(".bg-table-header-bg")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("bg-[var(--table-header-bg)]");
  });
});
