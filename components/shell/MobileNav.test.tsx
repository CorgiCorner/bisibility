import { MobileNav } from "@/components/shell/MobileNav";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/shell/SidebarFooter", () => ({
  SidebarFooter: ({ showBrand, version }: { showBrand?: boolean; version?: string }) => (
    <span
      data-brand={showBrand ? "true" : "false"}
      data-testid="sidebar-footer"
      data-version={version ?? ""}
    />
  ),
}));
vi.mock("@/components/shell/SidebarNav", () => ({
  SidebarNav: () => <span data-testid="sidebar-nav" />,
}));
vi.mock("@/components/shell/WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: ({ className, compact }: { className?: string; compact?: boolean }) => (
    <span
      className={className}
      data-compact={compact ? "true" : "false"}
      data-testid="workspace-switcher"
    />
  ),
}));

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

  it("matches the below-desktop search trigger class contract", () => {
    render(
      <MobileNav
        activeProjectId="project-1"
        canCreateWorkspace={false}
        projectRef="prj_1"
        workspaces={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "Menu" })).toHaveClass(
      "grid",
      "h-9",
      "w-9",
      "flex-none",
      "place-items-center",
      "rounded-control",
      "border-0",
      "bg-transparent",
      "p-0",
      "text-fg-muted",
      "shadow-none",
      "transition-colors",
      "hover:bg-bg-sunken",
      "hover:text-fg",
      "focus-visible:outline",
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-accent-solid",
    );
  });

  it("orders the compact switcher before navigation, with the branded footer last", () => {
    render(
      <MobileNav
        activeProjectId="project-1"
        canCreateWorkspace={false}
        defaultOpen
        projectRef="prj_1"
        version="0.17.0"
        workspaces={[]}
      />,
    );

    const switcher = screen.getByTestId("workspace-switcher");
    const navigation = screen.getByTestId("sidebar-nav");
    const footer = screen.getByTestId("sidebar-footer");

    expect(switcher).toHaveAttribute("data-compact", "true");
    expect(switcher.compareDocumentPosition(navigation)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(navigation.compareDocumentPosition(footer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(footer).toHaveAttribute("data-brand", "true");
    expect(footer).toHaveAttribute("data-version", "0.17.0");
  });

  it("places the compact switcher in the drawer header without keyword metadata", () => {
    render(
      <MobileNav
        activeProjectId="project-1"
        canCreateWorkspace={false}
        defaultOpen
        projectRef="prj_1"
        version="0.17.0"
        workspaces={[]}
      />,
    );

    const switcher = screen.getByTestId("workspace-switcher");
    const navContainer = screen.getByTestId("sidebar-nav").parentElement;

    expect(switcher).toHaveClass("w-full");
    expect(switcher.parentElement).toHaveClass("h-12", "px-[11px]", "pt-1");
    expect(navContainer).toHaveClass("mt-4");
  });
});
