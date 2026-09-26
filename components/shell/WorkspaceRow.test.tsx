import { MENU_ROW_STYLE, WorkspaceRow } from "@/components/shell/WorkspaceRow";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { Menu, MenuContent } from "@/components/ui/primitives/menu";
import { renderWithShellMessages as renderDom } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

function renderRow(active: boolean) {
  return render(<WorkspaceRow active={active} onSelect={vi.fn()} workspace={mockWorkspaces[0]} />);
}

function checkGlyph(container: HTMLElement) {
  return container.querySelector<SVGElement>("svg[data-workspace-check]");
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

  it("places the default star beside the item, before the check, and fills it when default", () => {
    const { container } = render(
      <WorkspaceRow
        active
        defaultStar={{ isDefault: true, onToggle: vi.fn() }}
        onSelect={vi.fn()}
        workspace={mockWorkspaces[0]}
      />,
    );

    const row = screen.getByRole("menuitem");
    const starButton = screen.getByRole("button", {
      name: `Default project: ${mockWorkspaces[0].name}`,
    });
    // A menuitem's children are presentational, so the button must not be nested inside it.
    expect(row.contains(starButton)).toBe(false);
    expect(starButton).toHaveAttribute("aria-pressed", "true");
    expect(starButton.querySelector("[data-default-star-fill]")).not.toBeNull();
    expect(starButton.className).not.toContain("opacity-0");
    expect(checkGlyph(container)?.style.visibility).toBe("visible");
  });

  it("keeps a non-default star hidden until the row is hovered or focused", () => {
    render(
      <WorkspaceRow
        active={false}
        defaultStar={{ isDefault: false, onToggle: vi.fn() }}
        onSelect={vi.fn()}
        workspace={mockWorkspaces[0]}
      />,
    );

    const starButton = screen.getByRole("button", { name: /^Default project:/ });
    expect(starButton).toHaveAttribute("aria-pressed", "false");
    expect(starButton.querySelector("[data-default-star-fill]")).toBeNull();
    expect(starButton).toHaveClass(
      "opacity-0",
      "group-hover/workspace-row:opacity-100",
      "group-focus-within/workspace-row:opacity-100",
      "[@media(hover:none)]:opacity-100",
    );
  });

  it("falls back to the domain's first letter under the favicon layer", () => {
    renderRow(false);

    expect(screen.getByText("a")).toBeInTheDocument();
  });

  it("keeps ICU counts and queued/empty states at the localized display boundary", () => {
    const rows = [
      { keywordCount: 0, name: "Łódź", state: "populated" as const },
      { keywordCount: 1, name: "One", state: "populated" as const },
      { keywordCount: 2, name: "Two", state: "populated" as const },
      { keywordCount: 5, name: "Five", state: "populated" as const },
      { keywordCount: 0, name: "Queued", state: "no-data" as const },
      { keywordCount: 0, name: "Empty", state: "empty" as const },
    ];
    render(
      rows.map((row, index) => (
        <WorkspaceRow
          active={false}
          key={row.name}
          onSelect={vi.fn()}
          workspace={{
            ...mockWorkspaces[0],
            ...row,
            id: `project-${index}`,
            publicId: `prj_${index}`,
          }}
        />
      )),
    );

    for (const label of ["0 keywords", "1 keyword", "2 keywords", "5 keywords"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("0 queued - no data")).toBeInTheDocument();
    expect(screen.getByText("New project")).toBeInTheDocument();
    expect(screen.getByText("Łódź")).toBeInTheDocument();
  });
});
