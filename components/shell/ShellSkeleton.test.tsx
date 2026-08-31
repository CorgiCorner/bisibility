import { navItemGroups, navItems } from "@/lib/nav/nav-items";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShellSkeleton } from "./ShellSkeleton";

function rowCount() {
  return navItems("[project]").length;
}

describe("ShellSkeleton", () => {
  it("reserves the expanded rail width the settled shell uses", () => {
    render(
      <ShellSkeleton>
        <div>content</div>
      </ShellSkeleton>,
    );

    expect(screen.getByTestId("shell-skeleton")).toHaveClass("lg:grid-cols-[270px_minmax(0,1fr)]");
  });

  it("reserves the collapsed rail width when the cookie says collapsed", () => {
    render(
      <ShellSkeleton collapsed>
        <div>content</div>
      </ShellSkeleton>,
    );

    expect(screen.getByTestId("shell-skeleton")).toHaveClass("lg:grid-cols-[80px_minmax(0,1fr)]");
  });

  it("draws one expanded row per rail item on the same rhythm as Sidebar", () => {
    const { container } = render(
      <ShellSkeleton>
        <div>content</div>
      </ShellSkeleton>,
    );

    // Nav rows are 36px and inset 10px, the settled rhythm. The workspace trigger is NOT one
    // of them: it is 44px in both states, so it has its own selector and its own count.
    const rows = container.querySelectorAll(".h-9.gap-2\\.5.pl-\\[1px\\]");
    expect(rows).toHaveLength(rowCount());
    expect(container.querySelectorAll(".h-11.gap-2\\.5.px-\\[11px\\]")).toHaveLength(1);

    // The fixed 30px leading slot is what puts the skeleton glyph on the settled rail's icon
    // axis. Without it the row lands 7px to the left and the shell jumps when data arrives.
    const slots = container.querySelectorAll(".h-\\[30px\\].w-\\[30px\\]");
    expect(slots.length).toBeGreaterThanOrEqual(rowCount());
  });

  it("draws the collapsed rail as 36px tiles on the settled rail icon axis", () => {
    const { container } = render(
      <ShellSkeleton collapsed>
        <div>content</div>
      </ShellSkeleton>,
    );

    const tiles = container.querySelectorAll(".h-9.w-9");
    // One 36px tile per nav row; the compact project favicon is deliberately smaller.
    expect(tiles).toHaveLength(rowCount());
    expect(container.querySelectorAll(".h-5.w-5")).toHaveLength(1);

    // Each row uses the explicit margin to hold the settled icon axis.
    expect(container.querySelectorAll(".ml-5\\.5")).toHaveLength(rowCount() + 1);
  });

  it("reserves one heading placeholder per rail group only while expanded", () => {
    const expanded = render(
      <ShellSkeleton>
        <div>content</div>
      </ShellSkeleton>,
    );
    const headings = expanded.getAllByTestId("shell-skeleton-nav-heading");
    expect(headings).toHaveLength(navItemGroups.length);
    // Same 28px box as the settled heading in Sidebar/SidebarNav: 14px top, a 10px line box
    // (asserted there as text-[10px] leading-none, here as the block's h-2.5), 4px bottom.
    for (const heading of headings) {
      expect(heading).toHaveClass("px-[11px]", "pt-3.5", "pb-1");
      expect(heading.querySelector(".h-2\\.5")).not.toBeNull();
    }
    expanded.unmount();

    const collapsed = render(
      <ShellSkeleton collapsed>
        <div>content</div>
      </ShellSkeleton>,
    );
    expect(collapsed.queryAllByTestId("shell-skeleton-nav-heading")).toHaveLength(0);
  });

  it("keeps utilities in the scrolling rail and leaves only the footer pinned", () => {
    const { container } = render(
      <ShellSkeleton collapsed>
        <div>content</div>
      </ShellSkeleton>,
    );

    const rail = screen.getByTestId("shell-skeleton-sidebar");
    const groups = Array.from(rail.children).map((child) => child.className);

    expect(groups).toHaveLength(3);
    expect(groups[1]).toContain("flex-1");
    expect(groups[1]).toContain("gap-0.5");
    expect(groups[1].includes("mt-auto")).toBe(false);
    // The footer remains pinned and centres its metadata in the collapsed rail.
    expect(groups[2]).toContain("justify-center");
    expect(container.querySelectorAll(".h-2\\.5.w-9")).toHaveLength(1);
  });

  it("keeps the expanded footer as the final pinned rail section", () => {
    render(
      <ShellSkeleton>
        <div>content</div>
      </ShellSkeleton>,
    );

    const rail = screen.getByTestId("shell-skeleton-sidebar");
    expect(rail.children[3].className).toContain("justify-between");
  });

  it("keeps the header frame and its three 32px controls", () => {
    const { container } = render(
      <ShellSkeleton>
        <div>content</div>
      </ShellSkeleton>,
    );

    expect(screen.getByTestId("shell-skeleton-header")).toHaveClass("border-b", "border-border");
    expect(container.querySelectorAll(".h-8.w-8.rounded-control")).toHaveLength(3);
  });

  it("frames the sidebar rather than filling it with a solid slab", () => {
    render(
      <ShellSkeleton>
        <div>content</div>
      </ShellSkeleton>,
    );

    const sidebar = screen.getByTestId("shell-skeleton-sidebar");
    expect(sidebar).toHaveClass("border-r", "border-border", "bg-bg-elev");
    expect(sidebar).not.toHaveClass("animate-pulse");
  });

  it("is hidden from assistive tech and holds nothing interactive", () => {
    const { container } = render(
      <ShellSkeleton>
        <div>content</div>
      </ShellSkeleton>,
    );

    expect(screen.getByTestId("shell-skeleton")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("a, button, input, select, textarea")).toHaveLength(0);
  });

  it("renders the content skeleton in the shell's content slot", () => {
    render(
      <ShellSkeleton>
        <div data-testid="content">content</div>
      </ShellSkeleton>,
    );

    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
});
