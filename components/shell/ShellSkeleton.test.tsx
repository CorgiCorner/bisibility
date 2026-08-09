import { navItems } from "@/lib/nav/nav-items";
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

    expect(screen.getByTestId("shell-skeleton")).toHaveClass("lg:grid-cols-[248px_minmax(0,1fr)]");
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

  it("draws the collapsed rail as 36px tiles on the settled rail's 22px icon axis", () => {
    const { container } = render(
      <ShellSkeleton collapsed>
        <div>content</div>
      </ShellSkeleton>,
    );

    const tiles = container.querySelectorAll(".h-9.w-9");
    // One 36px tile per nav row, plus the logo mark. The switcher is 44px in both states,
    // so it is deliberately not in this count.
    expect(tiles).toHaveLength(rowCount() + 1);
    expect(container.querySelectorAll(".h-11.w-9")).toHaveLength(1);

    // The explicit margin, not mx-auto, is what keeps the icon axis identical between the
    // two rail states. Every tile except the logo (centred inside its 48px head) carries it.
    expect(container.querySelectorAll(".ml-\\[22px\\]")).toHaveLength(rowCount() + 2);
  });

  it("orders the rail head, nav, utility, switcher, version and shows the version collapsed", () => {
    const { container } = render(
      <ShellSkeleton collapsed>
        <div>content</div>
      </ShellSkeleton>,
    );

    const rail = screen.getByTestId("shell-skeleton-sidebar");
    const groups = Array.from(rail.children).map((child) => child.className);

    expect(groups).toHaveLength(5);
    expect(groups[1]).toContain("flex-1");
    expect(groups[2]).toContain("mt-auto");
    expect(groups[2]).toContain("pt-4");
    // Nav rows stack on a 4px gap in both groups.
    expect(groups[1]).toContain("gap-1");
    expect(groups[2]).toContain("gap-1");
    // The version line is no longer dropped when the rail is collapsed; it centres instead.
    expect(groups[4]).toContain("justify-center");
    expect(container.querySelectorAll(".h-2\\.5.w-9")).toHaveLength(1);
  });

  it("keeps the version line right-aligned when the rail is expanded", () => {
    render(
      <ShellSkeleton>
        <div>content</div>
      </ShellSkeleton>,
    );

    const rail = screen.getByTestId("shell-skeleton-sidebar");
    expect(rail.children[4].className).toContain("justify-end");
  });

  it("keeps the header frame and its three 32px controls", () => {
    const { container } = render(
      <ShellSkeleton>
        <div>content</div>
      </ShellSkeleton>,
    );

    expect(screen.getByTestId("shell-skeleton-header")).toHaveClass("border-b", "border-border");
    expect(container.querySelectorAll(".h-8.w-8.rounded-\\[9px\\]")).toHaveLength(3);
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
