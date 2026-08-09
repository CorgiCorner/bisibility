import { WorkspaceRow } from "@/components/shell/WorkspaceRow";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

function renderRow(active: boolean) {
  return render(<WorkspaceRow active={active} onSelect={vi.fn()} workspace={mockWorkspaces[0]} />);
}

function checkGlyph(container: HTMLElement) {
  return container.querySelector<SVGElement>("svg");
}

describe("WorkspaceRow", () => {
  it("marks the current workspace with a visible check and no selected fill", () => {
    const { container } = renderRow(true);

    const row = screen.getByRole("menuitem");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(row.className).not.toContain("Mui-selected");
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
