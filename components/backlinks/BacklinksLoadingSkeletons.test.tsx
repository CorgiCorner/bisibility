import { render, screen } from "@testing-library/react";
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
      "rounded-[14px]",
      "border",
      "border-border",
      "bg-bg-elev",
      "p-4",
      "sm:p-5",
    );
    expect(form).toHaveClass("grid", "gap-3");
    expect(firstRow).toHaveClass("flex", "flex-col", "gap-3", "md:flex-row", "md:items-start");
    expect(target).toHaveClass(
      "h-[38px]",
      "flex-1",
      "rounded-[9px]",
      "border",
      "border-border-strong",
      "md:min-w-[240px]",
    );
    expect(scope).toHaveClass("h-[38px]", "md:w-[196px]");
    expect(limit).toHaveClass("min-h-[38px]", "lg:w-[132px]");
    expect(lowerRow).toHaveClass("flex", "flex-wrap", "items-center", "justify-between", "gap-3");
    expect(submitGroup).toHaveClass("flex", "flex-wrap", "items-center", "gap-4");
    expect(submit).toHaveClass("min-w-[216px]");
  });

  it("matches the settled non-compact idle-state surface", () => {
    render(<BacklinksPageLoading />);
    const idleSurface = screen.getByTestId("backlinks-idle-loading");
    const iconWell = screen.getByTestId("backlinks-idle-icon-loading");
    const title = iconWell.nextElementSibling;
    const copy = screen.getByTestId("backlinks-idle-copy-loading");
    const bullets = screen.getByTestId("backlinks-idle-bullets-loading");

    expect
      .soft(idleSurface)
      .toHaveClass(
        "flex",
        "flex-col",
        "items-center",
        "justify-center",
        "text-center",
        "rounded-2xl",
        "border",
        "border-border",
        "bg-bg-elev",
        "px-8",
        "py-11",
      );
    expect.soft(idleSurface).not.toHaveClass("min-h-[420px]");
    expect.soft(iconWell).toHaveClass("h-[54px]", "w-[54px]", "rounded-[14px]");
    expect.soft(iconWell).not.toHaveClass("size-16", "rounded-full");
    expect.soft(title).toHaveClass("mt-4.5", "h-5", "w-[210px]");
    expect.soft(copy).toHaveClass("mt-[7px]", "max-w-[430px]");
    expect.soft(bullets).toHaveClass("grid", "gap-1.5");
    expect(bullets?.children).toHaveLength(3);
  });

  it("exposes the result-loading state accessibly", () => {
    const { container } = render(<BacklinksResultsLoading />);

    expect(screen.getByLabelText("Backlinks loading")).toBeInTheDocument();
    expect(container.querySelector(".bg-table-header-bg")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("bg-[var(--table-header-bg)]");
  });
});
