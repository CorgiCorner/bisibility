import { MOTION_TOOLTIP } from "@/lib/ui/motion";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip, TooltipProvider } from "./Tooltip";

function mockMatchMedia(reduced = false) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduced && q === "(prefers-reduced-motion: reduce)",
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  mockMatchMedia(false);
});
afterEach(() => {
  act(() => vi.runAllTimers());
  vi.useRealTimers();
});

function renderSingle(content = "Tip") {
  render(
    <TooltipProvider>
      <Tooltip content={content}>
        <button type="button">T</button>
      </Tooltip>
    </TooltipProvider>,
  );
  return screen.getByText("T");
}

function renderTwo() {
  render(
    <TooltipProvider>
      <Tooltip content="A">
        <button type="button">A</button>
      </Tooltip>
      <Tooltip content="B">
        <button type="button">B</button>
      </Tooltip>
    </TooltipProvider>,
  );
  return { a: screen.getByText("A"), b: screen.getByText("B") };
}

function hoverOpen(el: HTMLElement) {
  fireEvent.mouseOver(el);
  act(() => vi.advanceTimersByTime(500));
}

function hoverClose(el: HTMLElement) {
  fireEvent.mouseLeave(el);
  act(() => vi.advanceTimersByTime(0));
  act(() => vi.advanceTimersByTime(MOTION_TOOLTIP));
}

describe("Tooltip cold touch", () => {
  it("stays hidden through 699ms then opens at 700ms", () => {
    const t = renderSingle();
    fireEvent.touchStart(t);
    act(() => vi.advanceTimersByTime(699));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("short touch ignores the synthesized hover that follows touchend", () => {
    const t = renderSingle();
    fireEvent.touchStart(t);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.touchEnd(t);
    fireEvent.mouseOver(t);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("touch cancel before 700ms never opens", () => {
    const t = renderSingle();
    fireEvent.touchStart(t);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.touchCancel(t);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("Tooltip warm touch", () => {
  it("warm tooltip still requires full 700ms long press", () => {
    const { a, b } = renderTwo();
    hoverOpen(a);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    hoverClose(a);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.touchStart(b);
    act(() => vi.advanceTimersByTime(699));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

describe("Tooltip touch leave delay", () => {
  it("closes after 1500ms leave delay following long-press release", () => {
    const t = renderSingle();
    fireEvent.touchStart(t);
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.touchEnd(t);
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    act(() => vi.advanceTimersByTime(MOTION_TOOLTIP));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("synthesized mouseleave does not close during leave window", () => {
    const t = renderSingle();
    fireEvent.touchStart(t);
    act(() => vi.advanceTimersByTime(700));
    fireEvent.touchEnd(t);
    fireEvent.mouseLeave(t);
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

describe("Tooltip touch interaction recovery", () => {
  it("pointer hover works after touch cleanup", () => {
    const t = renderSingle();
    fireEvent.touchStart(t);
    act(() => vi.advanceTimersByTime(700));
    fireEvent.touchEnd(t);
    act(() => vi.advanceTimersByTime(1500));
    act(() => vi.advanceTimersByTime(MOTION_TOOLTIP));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    hoverOpen(t);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    hoverClose(t);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("suppresses synthesized hover open during active touch", () => {
    const t = renderSingle();
    fireEvent.touchStart(t);
    act(() => vi.advanceTimersByTime(100));
    fireEvent.mouseOver(t);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

describe("Tooltip touch timer cleanup", () => {
  it("clears touch timers on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = render(
      <TooltipProvider>
        <Tooltip content="C">
          <button type="button">C</button>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByText("C");
    fireEvent.touchStart(trigger);
    act(() => vi.advanceTimersByTime(700));
    fireEvent.touchEnd(trigger);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("replaces open timer on re-touch without opening early", () => {
    const t = renderSingle();
    fireEvent.touchStart(t);
    act(() => vi.advanceTimersByTime(400));
    fireEvent.touchEnd(t);
    fireEvent.touchStart(t);
    act(() => vi.advanceTimersByTime(699));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("composes existing child touch handler", () => {
    const handler = vi.fn();
    render(
      <TooltipProvider>
        <Tooltip content="T">
          <button type="button" onTouchStart={handler}>
            T
          </button>
        </Tooltip>
      </TooltipProvider>,
    );
    const t = screen.getByText("T");
    fireEvent.touchStart(t);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
