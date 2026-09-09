import { TooltipProvider } from "@/components/ui/Tooltip";
import { appPath } from "@/lib/routing/app-path";
import { setNavigationState } from "@/tests/next-navigation";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarNav } from "./SidebarNav";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
  setNavigationState({ pathname: appPath("prj_1", "dashboard") });
});

afterEach(() => {
  act(() => vi.runAllTimers());
  vi.useRealTimers();
});

describe("SidebarNav tooltip collapse transition", () => {
  it("does not reveal module tooltips without new pointer or focus input", () => {
    function subject(collapsed: boolean) {
      return (
        <TooltipProvider>
          <SidebarNav collapsed={collapsed} projectRef="prj_1" />
        </TooltipProvider>
      );
    }

    const { rerender } = render(subject(false));
    fireEvent.pointerMove(screen.getByRole("link", { name: "Dashboard" }));
    fireEvent.pointerMove(screen.getByRole("link", { name: "Rank Tracker" }));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    rerender(subject(true));

    expect(screen.queryAllByRole("tooltip")).toHaveLength(0);

    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    fireEvent.pointerMove(dashboard);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Dashboard");

    fireEvent.pointerLeave(dashboard);
    act(() => vi.runAllTimers());
    const rankTracker = screen.getByRole("link", { name: "Rank Tracker" });
    const realMatches = rankTracker.matches.bind(rankTracker);
    rankTracker.matches = ((selector: string) =>
      selector === ":focus-visible" ? true : realMatches(selector)) as typeof rankTracker.matches;
    fireEvent.focus(rankTracker);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Rank Tracker");
  });
});
