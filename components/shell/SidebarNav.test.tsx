import { SidebarNav } from "@/components/shell/SidebarNav";
import { appPath } from "@/lib/routing/app-path";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/Tooltip", () => import("@/tests/mui-tooltip"));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("SidebarNav", () => {
  it("makes expanded navigation links span the drawer width", () => {
    setNavigationState({ pathname: appPath("prj_1", "dashboard") });
    render(<SidebarNav projectRef="prj_1" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass("w-full");
  });

  it("uses Ranking fill on the active Rank Tracker row", () => {
    setNavigationState({ pathname: appPath("prj_1", "rank-tracker") });
    render(<SidebarNav projectRef="prj_1" />);

    const current = screen.getByRole("link", { name: "Rank Tracker" }).querySelector("svg");
    const other = screen.getByRole("link", { name: "Dashboard" }).querySelector("svg");

    expect(current).toHaveAttribute("data-nav-icon", "Rank Tracker");
    expect(current).toHaveAttribute("data-weight", "fill");
    expect(other).toHaveAttribute("data-weight", "regular");
  });
});
