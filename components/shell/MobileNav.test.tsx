import { MobileNav } from "@/components/shell/MobileNav";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/shell/SidebarFooter", () => ({ SidebarFooter: () => null }));
vi.mock("@/components/shell/SidebarNav", () => ({ SidebarNav: () => null }));
vi.mock("@/components/shell/WorkspaceSwitcher", () => ({ WorkspaceSwitcher: () => null }));

describe("MobileNav", () => {
  it("keeps the MUI menu button inside a desktop-hidden wrapper", () => {
    render(
      <MobileNav
        activeProjectId="project-1"
        canCreateWorkspace={false}
        projectRef="prj_1"
        workspaces={[]}
      />,
    );

    const menuButton = screen.getByRole("button", { name: "Menu" });

    expect(menuButton).not.toHaveClass("lg:hidden");
    expect(menuButton.parentElement).toHaveClass("lg:hidden");
  });
});
