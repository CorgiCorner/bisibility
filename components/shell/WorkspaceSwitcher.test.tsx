import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

vi.mock("@mui/material/Tooltip", () => import("@/tests/mui-tooltip"));

describe("WorkspaceSwitcher", () => {
  it.each([true, false])(
    "renders project creation when the actor-owned capability is %s",
    async (canCreateWorkspace) => {
      render(
        <WorkspaceSwitcher
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace={canCreateWorkspace}
          workspaces={mockWorkspaces}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
      await screen.findByRole("menu", { name: "Projects" });

      expect(screen.getAllByText(mockWorkspaces[0].name).length).toBeGreaterThan(0);
      expect(Boolean(screen.queryByRole("menuitem", { name: "Create project" }))).toBe(
        canCreateWorkspace,
      );
      // The rail already carries Settings and it points at this same screen. The switcher is
      // for changing project, not a second door into the same page.
      expect(screen.queryByRole("menuitem", { name: "Project settings" })).toBeNull();
      expect(
        screen.getByRole("menuitem", { name: new RegExp(mockWorkspaces[1].name) }),
      ).toHaveAttribute("href", `/app/${mockWorkspaces[1].publicId}/dashboard`);
    },
  );

  it("labels the collapsed trigger with a right-aligned tooltip", () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        collapsed
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });
    expect(trigger.closest("[data-tooltip]")).toHaveAttribute("data-tooltip", "Switch project");
    expect(trigger.closest("[data-tooltip]")).toHaveAttribute("data-tooltip-placement", "right");
  });

  it("suppresses the expanded trigger tooltip", () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Switch project" }).closest("[data-tooltip]"),
    ).toHaveAttribute("data-tooltip", "");
  });

  it("keeps the trigger transparent in the default ghost variant and boxed on request", () => {
    const { rerender } = render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    expect(screen.getByRole("button", { name: "Switch project" }).className).toContain(
      "border-transparent",
    );

    rerender(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        variant="boxed"
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });
    expect(trigger.className).toContain("border-border-strong");
    expect(trigger.className).toContain("bg-bg-elev");
  });

  it("shows the workspace tile in the trigger without encoding selection", () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Switch project" });
    const tile = trigger.querySelector("[aria-hidden]");
    expect(tile?.textContent).toBe("a");
    expect(tile?.className).not.toContain("accent");
  });
});
