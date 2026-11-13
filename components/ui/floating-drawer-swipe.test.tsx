import {
  renderWithFeatureMessages,
  sharedControlTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { FLOATING_DRAWER_SWIPE_CLOSE_PX } from "@/lib/ui/floating-drawer";
import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDrawer } from "./AppDrawer";
import { Sheet } from "./Sheet";

function render(ui: React.ReactElement) {
  return renderWithFeatureMessages(ui, { messages: sharedControlTestMessages });
}

function setMedia(desktop: boolean, reduced = false) {
  const queries: Record<string, boolean> = {
    "(min-width: 640px)": desktop,
    "(prefers-reduced-motion: reduce)": reduced,
  };
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: queries[query] ?? false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function panel() {
  const node = document.querySelector("[data-ui-overlay]");
  if (!(node instanceof HTMLElement)) throw new Error("Missing drawer panel");
  return node;
}

function drag(target: Element, from: number, to: number) {
  fireEvent.pointerDown(target, { button: 0, clientY: from, pointerId: 1 });
  fireEvent.pointerMove(target, { button: 0, clientY: to, pointerId: 1 });
  fireEvent.pointerUp(target, { button: 0, clientY: to, pointerId: 1 });
}

describe("drawer swipe to close", () => {
  beforeEach(() => {
    setMedia(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("closes the sheet when the grab is dragged past the threshold", () => {
    const onClose = vi.fn();
    render(
      <Sheet onClose={onClose} open title="Swipe">
        <button type="button">content</button>
      </Sheet>,
    );
    const grab = panel().querySelector("[data-drawer-grab]");
    if (!grab) throw new Error("Missing grab");
    drag(grab, 40, 40 + FLOATING_DRAWER_SWIPE_CLOSE_PX);
    expect(onClose).toHaveBeenCalledOnce();
    expect(panel().style.transform).toBe("");
  });

  it("snaps back when the drag stops short of the threshold", () => {
    const onClose = vi.fn();
    render(
      <Sheet onClose={onClose} open title="Short">
        <button type="button">content</button>
      </Sheet>,
    );
    const grab = panel().querySelector("[data-drawer-grab]");
    if (!grab) throw new Error("Missing grab");
    drag(grab, 40, 40 + FLOATING_DRAWER_SWIPE_CLOSE_PX - 1);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel().style.transform).toBe("");
    expect(panel().style.transition).toContain("transform");
  });

  it("does not animate the snap back when reduced motion is requested", () => {
    setMedia(false, true);
    render(
      <Sheet onClose={vi.fn()} open title="Reduced">
        <button type="button">content</button>
      </Sheet>,
    );
    const grab = panel().querySelector("[data-drawer-grab]");
    if (!grab) throw new Error("Missing grab");
    drag(grab, 40, 50);
    expect(panel().style.transition).toBe("");
    expect(panel().style.transform).toBe("");
  });

  it("ignores a drag that starts on the close button", () => {
    const onClose = vi.fn();
    render(
      <Sheet onClose={onClose} open title="Button">
        <button type="button">content</button>
      </Sheet>,
    );
    drag(panel().querySelector("header button") as Element, 0, 200);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not swipe-close the floating panel", () => {
    setMedia(true);
    const onClose = vi.fn();
    render(
      <Sheet onClose={onClose} open title="Desktop">
        <button type="button">content</button>
      </Sheet>,
    );
    expect(document.querySelector("[data-drawer-grab]")).toBeNull();
    drag(panel().querySelector("header") as Element, 0, 200);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes an app drawer through the same gesture without a close reason", () => {
    const onClose = vi.fn();
    render(
      <AppDrawer onClose={onClose} open title="Drawer">
        <button type="button">content</button>
      </AppDrawer>,
    );
    const grab = panel().querySelector("[data-drawer-grab]");
    if (!grab) throw new Error("Missing grab");
    drag(grab, 10, 10 + FLOATING_DRAWER_SWIPE_CLOSE_PX);
    expect(onClose).toHaveBeenCalledExactlyOnceWith();
  });
});
