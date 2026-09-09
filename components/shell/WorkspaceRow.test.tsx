import { MENU_ROW_STYLE, WorkspaceRow } from "@/components/shell/WorkspaceRow";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { Menu, MenuContent } from "@/components/ui/primitives/menu";
import { render as renderDom, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

function renderRow(active: boolean) {
  return render(<WorkspaceRow active={active} onSelect={vi.fn()} workspace={mockWorkspaces[0]} />);
}

function checkGlyph(container: HTMLElement) {
  return container.querySelector<SVGElement>("svg");
}

function render(children: ReactNode) {
  return renderDom(
    <Menu open>
      <MenuContent>{children}</MenuContent>
    </Menu>,
  );
}

describe("WorkspaceRow", () => {
  it("uses the sunken surface for pointer and keyboard focus while preserving active press", () => {
    expect(MENU_ROW_STYLE["--control-hover-background-color"]).toBe("var(--bg-sunken)");
    expect(MENU_ROW_STYLE["--control-focus-background-color"]).toBe("var(--bg-sunken)");
    expect(MENU_ROW_STYLE["--control-active-background-color"]).toBe("var(--bg-inset)");
    expect(MENU_ROW_STYLE["--control-selected-background-color"]).toBe("transparent");
  });

  it("marks the current workspace with a visible check and no selected fill", () => {
    const { container } = renderRow(true);

    const row = screen.getByRole("menuitem");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(row).not.toHaveAttribute("data-selected", "true");
    expect(checkGlyph(container)?.style.visibility).toBe("visible");
  });

  it("keeps the check in the DOM but hidden on every other row, so opening never relayouts", () => {
    const { container } = renderRow(false);

    expect(screen.getByRole("menuitem")).not.toHaveAttribute("aria-current");
    expect(checkGlyph(container)).not.toBeNull();
    expect(checkGlyph(container)?.style.visibility).toBe("hidden");
  });

  it("falls back to the domain's first letter under the favicon layer", () => {
    renderRow(false);

    expect(screen.getByText("a")).toBeInTheDocument();
  });
});
