import { MOTION_MENU_EXIT } from "@/lib/ui/motion";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertBanner } from "./AlertBanner";

const FALLBACK_MS = MOTION_MENU_EXIT + 50;

function setReducedMotion(reduced: boolean): void {
  const queries: Record<string, boolean> = {
    "(prefers-reduced-motion: reduce)": reduced,
  };
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: queries[q] ?? false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function dismissButton(): HTMLElement {
  return screen.getByRole("button", { name: "Dismiss alert" });
}

function bannerOutput(): HTMLElement {
  return dismissButton().closest("output") as HTMLElement;
}

function fireTransitionEnd(
  node: HTMLElement,
  property = "opacity",
  target: HTMLElement = node,
): void {
  const event = new TransitionEvent("transitionend", { bubbles: true, propertyName: property });
  Object.defineProperty(event, "target", { value: target });
  Object.defineProperty(event, "currentTarget", { value: node });
  fireEvent(node, event);
}

const BASE_PROPS = {
  detail: "headless cms: Provider request failed.",
  tint: "red" as const,
  title: "2 rank checks failed in the last 24 hours.",
};

describe("AlertBanner dismiss", () => {
  beforeEach(() => {
    setReducedMotion(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shares one CSS background treatment for hover and focus-visible", () => {
    const onDismiss = vi.fn();
    render(<AlertBanner {...BASE_PROPS} onDismiss={onDismiss} />);
    const button = dismissButton();
    expect(button.className).toContain("hover:bg-[var(--alert-dismiss-hover)]");
    expect(button.className).toContain("focus-visible:bg-[var(--alert-dismiss-hover)]");
  });

  it("does not mutate inline style on mouse enter/leave", () => {
    const onDismiss = vi.fn();
    render(<AlertBanner {...BASE_PROPS} onDismiss={onDismiss} />);
    const button = dismissButton();
    const before = button.getAttribute("style");
    fireEvent.mouseEnter(button);
    expect(button.getAttribute("style")).toBe(before);
    fireEvent.mouseLeave(button);
    expect(button.getAttribute("style")).toBe(before);
  });

  it("retains the banner and defers onDismiss until the opacity transition ends", () => {
    const onDismiss = vi.fn();
    render(<AlertBanner {...BASE_PROPS} onDismiss={onDismiss} />);
    fireEvent.click(dismissButton());
    expect(onDismiss).not.toHaveBeenCalled();
    expect(bannerOutput().className).toContain("opacity-0");
    expect(bannerOutput().className).toContain("pointer-events-none");

    fireTransitionEnd(bannerOutput(), "opacity");
    expect(vi.getTimerCount()).toBe(0);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("transitionend calls onDismiss, cancels fallback, and advancing past it does not call again", () => {
    const onDismiss = vi.fn();
    render(<AlertBanner {...BASE_PROPS} onDismiss={onDismiss} />);
    fireEvent.click(dismissButton());
    fireTransitionEnd(bannerOutput(), "opacity");
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(FALLBACK_MS + 100);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("with no transitionend, advancing to the fallback deadline calls onDismiss exactly once", () => {
    const onDismiss = vi.fn();
    render(<AlertBanner {...BASE_PROPS} onDismiss={onDismiss} />);
    fireEvent.click(dismissButton());
    expect(vi.getTimerCount()).toBe(1);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FALLBACK_MS - 1);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("repeated clicks remain idempotent", () => {
    const onDismiss = vi.fn();
    render(<AlertBanner {...BASE_PROPS} onDismiss={onDismiss} />);
    fireEvent.click(dismissButton());
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.click(dismissButton());
    expect(vi.getTimerCount()).toBe(1);
    fireEvent.click(dismissButton());
    expect(vi.getTimerCount()).toBe(1);
    expect(bannerOutput().className).toContain("opacity-0");
    expect(onDismiss).not.toHaveBeenCalled();
    fireTransitionEnd(bannerOutput(), "opacity");
    expect(onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.click(dismissButton());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("unmount before the deadline clears the pending timer and does not call onDismiss", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<AlertBanner {...BASE_PROPS} onDismiss={onDismiss} />);
    fireEvent.click(dismissButton());
    expect(onDismiss).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(FALLBACK_MS + 1000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("reduced motion calls immediately exactly once and ignores later events and timers", () => {
    setReducedMotion(true);
    const onDismiss = vi.fn();
    render(<AlertBanner {...BASE_PROPS} onDismiss={onDismiss} />);
    fireEvent.click(dismissButton());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    fireTransitionEnd(bannerOutput(), "opacity");
    vi.advanceTimersByTime(FALLBACK_MS + 1000);
    fireEvent.click(dismissButton());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("child and non-opacity transition events remain ignored until the real transition or fallback", () => {
    const onDismiss = vi.fn();
    render(<AlertBanner {...BASE_PROPS} onDismiss={onDismiss} />);
    fireEvent.click(dismissButton());
    expect(vi.getTimerCount()).toBe(1);
    fireTransitionEnd(bannerOutput(), "background-color");
    expect(onDismiss).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    fireTransitionEnd(bannerOutput(), "opacity", dismissButton());
    expect(onDismiss).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    fireTransitionEnd(bannerOutput(), "opacity");
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(FALLBACK_MS + 1000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
