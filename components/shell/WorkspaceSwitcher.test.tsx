import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

vi.mock("@mui/material/Tooltip", () => import("@/tests/mui-tooltip"));

describe("WorkspaceSwitcher", () => {
  it.each([true, false])(
    "renders workspace creation when the actor-owned capability is %s",
    async (canCreateWorkspace) => {
      render(
        <WorkspaceSwitcher
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace={canCreateWorkspace}
          workspaces={mockWorkspaces}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Switch workspace" }));
      await screen.findByRole("menu", { name: "Workspaces" });

      expect(screen.getAllByText(mockWorkspaces[0].name).length).toBeGreaterThan(0);
      expect(Boolean(screen.queryByRole("menuitem", { name: "Create workspace" }))).toBe(
        canCreateWorkspace,
      );
      expect(
        screen.getByRole("menuitem", { name: new RegExp(mockWorkspaces[1].name) }),
      ).toHaveAttribute("href", `/app/${mockWorkspaces[1].publicId}/overview`);
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

    const trigger = screen.getByRole("button", { name: "Switch workspace" });
    expect(trigger.closest("[data-tooltip]")).toHaveAttribute("data-tooltip", "Switch workspace");
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
      screen.getByRole("button", { name: "Switch workspace" }).closest("[data-tooltip]"),
    ).toHaveAttribute("data-tooltip", "");
  });
});
