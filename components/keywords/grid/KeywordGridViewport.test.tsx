import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordGridViewport } from "./KeywordGridViewport";

vi.mock("./DeferredDataGrid", () => ({
  DeferredDataGrid: () => <div data-testid="deferred-data-grid" />,
}));

describe("KeywordGridViewport", () => {
  it("keeps the grid frame constrained while leaving column overflow to DataGrid", () => {
    render(
      <KeywordGridViewport
        columns={[]}
        onNavigate={vi.fn()}
        rows={[]}
        toggleParent={() => false}
      />,
    );

    const viewport = screen.getByTestId("keywords-grid-viewport");
    const ancestorClasses = [];
    let ancestor = viewport.parentElement;
    while (ancestor) {
      ancestorClasses.push(...ancestor.classList);
      ancestor = ancestor.parentElement;
    }

    expect(ancestorClasses).not.toContain("overflow-x-auto");
    expect(viewport).toHaveClass("w-full", "min-w-0");
    expect(viewport).not.toHaveClass("min-w-[1080px]");
  });
});
