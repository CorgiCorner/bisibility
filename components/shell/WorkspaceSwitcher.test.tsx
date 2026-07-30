import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

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
});
