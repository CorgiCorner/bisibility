import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckDepthSplitButton } from "./CheckDepthSplitButton";

describe("CheckDepthSplitButton", () => {
  it("uses the compact bulk-bar height and outlined chrome at xs", () => {
    render(
      <CheckDepthSplitButton
        actionLabel="Run check (Top 20)"
        currentDepth={20}
        onAction={vi.fn()}
        onDepthChange={vi.fn()}
        size="xs"
      />,
    );

    const action = screen.getByRole("button", { name: "Run check (Top 20)" });
    expect(action).toHaveClass("min-h-[30px]");
    expect(action).toHaveClass("MuiButton-outlined");
    expect(action).not.toHaveClass("MuiButton-contained");
  });

  it("uses the header CTA height at md", () => {
    render(
      <CheckDepthSplitButton
        actionLabel="Run first check (Top 20)"
        currentDepth={20}
        onAction={vi.fn()}
        onDepthChange={vi.fn()}
      />,
    );

    const action = screen.getByRole("button", { name: "Run first check (Top 20)" });
    expect(action).toHaveClass("min-h-[36px]");
    expect(action).toHaveClass("MuiButton-outlined");
    expect(action).not.toHaveClass("min-h-[30px]");
    expect(action).not.toHaveClass("MuiButton-contained");
  });

  it("runs from the primary button and only changes depth from the menu", () => {
    const onAction = vi.fn();
    const onDepthChange = vi.fn();
    render(
      <CheckDepthSplitButton
        actionLabel="Run check (Top 50)"
        currentDepth={50}
        onAction={onAction}
        onDepthChange={onDepthChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run check (Top 50)" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onDepthChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Top 20" }));
    expect(onDepthChange).toHaveBeenCalledWith(20);
    expect(onAction).toHaveBeenCalledOnce();
  });
});
