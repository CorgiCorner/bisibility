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

function transitionNode() {
  return screen.getByRole("tooltip").firstElementChild as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockMatchMedia(false);
});
afterEach(() => {
  act(() => vi.runAllTimers());
  vi.useRealTimers();
});

function open(el: HTMLElement, ms = 500) {
  fireEvent.mouseOver(el);
  act(() => vi.advanceTimersByTime(ms));
}

function close(el: HTMLElement) {
  fireEvent.mouseLeave(el);
  act(() => vi.advanceTimersByTime(0));
  act(() => vi.advanceTimersByTime(MOTION_TOOLTIP));
}

function renderSingle(content = "Tip", semantics?: "description") {
  render(
    <TooltipProvider>
      <Tooltip content={content} semantics={semantics}>
        <button type="button">T</button>
      </Tooltip>
    </TooltipProvider>,
  );
  return screen.getByText("T");
}

function controlFocusVisible(el: HTMLElement) {
  const realMatches = el.matches.bind(el);
  let visible = true;
  el.matches = ((selector: string) =>
    selector === ":focus-visible" ? visible : realMatches(selector)) as typeof el.matches;
  return { hide: () => (visible = false) };
}

describe("Tooltip enter delay and cold animation", () => {
  it("waits 500ms before showing on hover", () => {
    const t = renderSingle();
    fireEvent.mouseOver(t);
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("cold open starts at scale(0.97)", () => {
    const t = renderSingle();
    open(t);
    expect(transitionNode().style.transform).toBe("scale(0.97)");
    expect(transitionNode().style.transition).toContain(`${MOTION_TOOLTIP}ms`);
  });
});

describe("Tooltip warm sequence", () => {
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

  it("second tooltip within 800ms is instant, no reanimation", () => {
    const { a, b } = renderTwo();
    open(a);
    expect(transitionNode().style.transform).toBe("scale(0.97)");
    close(a);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    open(b, 0);
    expect(transitionNode().style.transform).toBe("none");
    expect(transitionNode().style.transition).toBe("none");
  });

  it("an overlapping second tooltip pairs zero delay with zero transition", () => {
    const { a, b } = renderTwo();
    open(a);
    open(b, 0);
    const second = screen.getAllByRole("tooltip").find((node) => node.textContent === "B");
    expect(second?.firstElementChild).toHaveStyle({ transform: "none", transition: "none" });
  });

  it("cold returns after 800ms warm window", () => {
    const { a, b } = renderTwo();
    open(a);
    close(a);
    act(() => vi.advanceTimersByTime(800 - MOTION_TOOLTIP));
    open(b);
    expect(transitionNode().style.transform).toBe("scale(0.97)");
  });
});

describe("Tooltip keyboard", () => {
  it("opens on keyboard focus", () => {
    renderSingle("Help");
    const t = screen.getByText("T");
    controlFocusVisible(t);
    fireEvent.focus(t);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderSingle("Help");
    const t = screen.getByText("T");
    open(t);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(MOTION_TOOLTIP));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes on blur", () => {
    renderSingle("Help");
    const t = screen.getByText("T");
    const focusVisible = controlFocusVisible(t);
    fireEvent.focus(t);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    focusVisible.hide();
    fireEvent.blur(t);
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(MOTION_TOOLTIP));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("Tooltip portal", () => {
  it("escapes overflow-hidden host", () => {
    render(
      <TooltipProvider>
        <div data-testid="host" style={{ overflow: "hidden", height: 50 }}>
          <Tooltip content="P">
            <button type="button">In</button>
          </Tooltip>
        </div>
      </TooltipProvider>,
    );
    open(screen.getByText("In"));
    const tip = screen.getByRole("tooltip");
    expect(screen.getByTestId("host").contains(tip)).toBe(false);
    expect(document.body.contains(tip)).toBe(true);
  });
});

describe("Tooltip description semantics", () => {
  it("uses aria-describedby without native title", () => {
    renderSingle("More", "description");
    const t = screen.getByRole("button", { name: "T" });
    expect(t).not.toHaveAttribute("title");
    expect(t).toHaveAttribute("aria-describedby");
    const describedBy = t.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    const desc = document.getElementById(describedBy ?? "");
    expect(desc).toHaveTextContent("More");
    open(t);
    expect(screen.getByRole("button", { name: "T" })).toBe(t);
    expect(t).not.toHaveAttribute("aria-labelledby");
    expect(t).not.toHaveAttribute("aria-label");
  });

  it("merges an existing description id", () => {
    render(
      <TooltipProvider>
        <span id="existing-description">Existing</span>
        <Tooltip content="More" semantics="description">
          <button aria-describedby="existing-description" type="button">
            Named trigger
          </button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Named trigger" })).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("existing-description"),
    );
  });
});

describe("Tooltip reduced motion", () => {
  it("no scale transform under reduced motion", () => {
    mockMatchMedia(true);
    const t = renderSingle();
    open(t);
    expect(transitionNode().style.transform).toBe("none");
    expect(transitionNode().style.transition).toBe("none");
  });
});

describe("TooltipProvider cleanup", () => {
  it("clears the cooldown timer on provider unmount", () => {
    const setSpy = vi.spyOn(globalThis, "setTimeout");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = render(
      <TooltipProvider>
        <Tooltip content="C">
          <button type="button">C</button>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button", { name: "C" });
    open(trigger);
    fireEvent.mouseLeave(trigger);
    act(() => vi.advanceTimersByTime(0));
    const cooldownIndexes = setSpy.mock.calls.flatMap((call, index) =>
      call[1] === 800 ? [index] : [],
    );
    const providerTimer = setSpy.mock.results[cooldownIndexes.at(-1) ?? -1]?.value;
    expect(providerTimer).toBeDefined();
    unmount();
    expect(clearSpy).toHaveBeenCalledWith(providerTimer);
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it("cancels an active transition RAF on unmount", () => {
    const rafSpy = vi.spyOn(globalThis, "cancelAnimationFrame");
    const { unmount } = render(
      <TooltipProvider>
        <Tooltip content="C">
          <button type="button">C</button>
        </Tooltip>
      </TooltipProvider>,
    );
    open(screen.getByRole("button", { name: "C" }));
    unmount();
    expect(rafSpy).toHaveBeenCalled();
    rafSpy.mockRestore();
  });
});
