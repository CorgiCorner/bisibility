import { routerMock } from "@/tests/next-navigation";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { TransitionStartFunction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transition = vi.hoisted(() => ({ pending: false }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useTransition: (): [boolean, TransitionStartFunction] => [
      transition.pending,
      (callback) => callback(),
    ],
  };
});

import { SearchInsightsRefresh } from "./SearchInsightsRefresh";

function visibility(value: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  fireEvent(document, new Event("visibilitychange"));
}

describe("SearchInsightsRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    transition.pending = false;
    visibility("visible");
  });
  it("polls around 45 seconds without duplicate timers and stops when inactive or unmounted", () => {
    const view = render(<SearchInsightsRefresh active />);
    act(() => vi.advanceTimersByTime(44_999));
    expect(routerMock.refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    view.rerender(<SearchInsightsRefresh active={false} />);
    act(() => vi.advanceTimersByTime(90_000));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels while hidden and resumes once without overlap", () => {
    const view = render(<SearchInsightsRefresh active />);
    visibility("hidden");
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(90_000));
    expect(routerMock.refresh).not.toHaveBeenCalled();
    visibility("visible");
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(45_000));
    expect(routerMock.refresh).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
  });
  it("uses the Button loading contract while preserving the spinning refresh icon", () => {
    transition.pending = true;
    render(<SearchInsightsRefresh active={false} />);

    const button = screen.getByRole("button", { name: "Refresh import status" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg")).toHaveClass("animate-spin");
  });
  it("returns from pending to one idle transparent refresh icon", () => {
    transition.pending = true;
    const view = render(<SearchInsightsRefresh active={false} />);
    let button = screen.getByRole("button", { name: "Refresh import status" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    expect(button.querySelector("svg")).toHaveClass("animate-spin");

    transition.pending = false;
    view.rerender(<SearchInsightsRefresh active={false} />);
    button = screen.getByRole("button", { name: "Refresh import status" });

    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-busy", "true");
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    expect(button.querySelector("svg")).not.toHaveClass("animate-spin");
    const generatedClass = Array.from(button.classList).find((className) =>
      className.endsWith("-MuiButton-root"),
    );
    const rules = Array.from(document.styleSheets).flatMap((sheet) =>
      Array.from(sheet.cssRules, (rule) => rule.cssText),
    );
    expect(
      rules.some(
        (rule) =>
          rule.includes(`.${generatedClass}:not(.Mui-focusVisible):not(:hover)`) &&
          rule.includes("background-color: transparent"),
      ),
    ).toBe(true);
  });

  it("returns pointer-focused refresh to a borderless transparent idle state", async () => {
    render(<SearchInsightsRefresh active={false} />);
    const button = screen.getByRole("button", { name: "Refresh import status" });

    fireEvent.mouseDown(button);
    button.focus();
    fireEvent.mouseUp(button);
    fireEvent.click(button);
    fireEvent.mouseLeave(button);

    const style = getComputedStyle(button);
    expect(button).toHaveFocus();
    expect(button).not.toHaveClass("Mui-focusVisible");
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.borderStyle).toBe("none");
    expect(style.boxShadow).toBe("none");
    expect(button.querySelector(".MuiTouchRipple-root")).toBeNull();
  });

  it("keeps manual refresh available while polling is inactive", () => {
    render(<SearchInsightsRefresh active={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh import status" }));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
