import {
  FLOATING_SELECTION_BAR_SPACE,
  FloatingSelectionBar,
  FloatingSelectionBarSpacer,
} from "@/components/ui/FloatingSelectionBar";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

function renderBar(count: number, onClear = vi.fn()) {
  return render(
    <FloatingSelectionBar
      ariaLabel="Selection actions"
      clearLabel="Clear"
      count={count}
      countLabel={`${count} selected`}
      footer={count > 2 ? <p>Could not update rows.</p> : null}
      onClear={onClear}
    >
      <button type="button">Tag</button>
      <button type="button">Delete</button>
    </FloatingSelectionBar>,
  );
}

describe("FloatingSelectionBar", () => {
  it("renders no bar at zero but keeps an empty live region mounted", () => {
    renderBar(0);

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("shows the count, actions and Clear in a labelled toolbar", () => {
    const onClear = vi.fn();
    renderBar(2, onClear);

    const bar = screen.getByRole("toolbar", { name: "Selection actions" });
    expect(bar).toHaveAttribute("aria-orientation", "horizontal");
    expect(within(bar).getByText("2 selected")).toHaveClass("font-semibold", "tabular-nums");
    expect(within(bar).getByRole("button", { name: "Tag" })).toBeInTheDocument();

    fireEvent.click(within(bar).getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("announces count changes politely without moving focus", () => {
    const { rerender } = renderBar(0);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");

    rerender(
      <FloatingSelectionBar
        ariaLabel="Selection actions"
        clearLabel="Clear"
        count={3}
        countLabel="3 selected"
        onClear={vi.fn()}
      >
        <button type="button">Tag</button>
      </FloatingSelectionBar>,
    );

    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("3 selected");
    expect(document.activeElement).toBe(document.body);
  });

  it("docks at the bottom above page chrome and below overlays", () => {
    renderBar(1);

    const dock = screen.getByRole("toolbar").closest("[data-floating-selection-bar]");
    expect(dock).toHaveClass("fixed", "bottom-0", "z-30", "left-[var(--app-sidebar-width,0px)]");
    expect(screen.getByRole("toolbar")).toHaveClass(
      "bg-bg-elev",
      "border",
      "border-border",
      "rounded-card",
      "max-w-[960px]",
    );
  });

  it("keeps actions on one horizontally scrollable row with the ends pinned", () => {
    renderBar(1);

    const bar = screen.getByRole("toolbar");
    const actions = bar.querySelector("[data-floating-selection-actions]") as HTMLElement;
    expect(actions).toHaveClass("overflow-x-auto", "flex-nowrap", "min-w-0", "flex-1");
    expect(within(actions).queryByText("1 selected")).not.toBeInTheDocument();
    expect(within(actions).queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Clear" })).toHaveClass("shrink-0");
  });

  it("renders the footer slot under the actions", () => {
    renderBar(3);

    expect(within(screen.getByRole("toolbar")).getByText("Could not update rows.")).toBeVisible();
  });

  it("reserves the documented space with its spacer", () => {
    const { container } = render(<FloatingSelectionBarSpacer />);
    const spacer = container.firstElementChild as HTMLElement;

    expect(spacer).toHaveAttribute("aria-hidden", "true");
    // jsdom cannot round-trip env(), so assert the constant and the applied length separately.
    expect(FLOATING_SELECTION_BAR_SPACE).toContain("safe-area-inset-bottom");
    expect(spacer.style.height).toContain("72px");
  });
});
