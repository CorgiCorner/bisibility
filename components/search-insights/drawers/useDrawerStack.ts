"use client";

import { type RefObject, useState } from "react";
import { flushSync } from "react-dom";
import { drawerBackLabel, type SearchInsightsDrawerFrame } from "./drawer-model";

/** A frame and where the customer had scrolled to when they left it. */
export type DrawerStackEntry = {
  frame: SearchInsightsDrawerFrame;
  scroll: number;
};

export type DrawerStack = {
  /** Title of the frame Back would return to, or nothing when there is none. */
  back: string | null;
  close: () => void;
  frame: SearchInsightsDrawerFrame | null;
  open: (frame: SearchInsightsDrawerFrame) => void;
  opened: boolean;
  pop: () => void;
  push: (frame: SearchInsightsDrawerFrame) => void;
  /** Clears the stack once the panel has finished sliding out. */
  reset: () => void;
};

/**
 * The drawer stack: opening from the page starts a new one, a row inside a drawer pushes onto
 * it, and Back pops it. Push records the offset the origin frame was left at so Back can put the
 * customer back where they were rather than at the top of a list they had scrolled through.
 */
export function useDrawerStack(bodyRef: RefObject<HTMLElement | null>): DrawerStack {
  const [stack, setStack] = useState<readonly DrawerStackEntry[]>([]);
  const [opened, setOpened] = useState(false);

  const frame = stack.at(-1)?.frame ?? null;
  const previous = stack.at(-2)?.frame ?? null;

  /**
   * The row that swapped the frame is gone, so the caret has to be put back inside the panel or
   * Escape would be handled by the page behind it rather than by the drawer.
   */
  function focusBody(scroll: number) {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = scroll;
    body.focus({ preventScroll: true });
  }

  function open(next: SearchInsightsDrawerFrame) {
    setStack([{ frame: next, scroll: 0 }]);
    setOpened(true);
  }

  function push(next: SearchInsightsDrawerFrame) {
    const scroll = bodyRef.current?.scrollTop ?? 0;
    setStack((current) => [
      ...current.slice(0, -1),
      ...current.slice(-1).map((entry) => ({ ...entry, scroll })),
      { frame: next, scroll: 0 },
    ]);
    focusBody(0);
  }

  function pop() {
    const restored = stack.at(-2);
    if (!restored) {
      close();
      return;
    }
    // The offset belongs to markup that does not exist yet, so the frame is committed first and
    // the scroll position applied to the body the customer is actually looking at.
    flushSync(() => setStack((current) => current.slice(0, -1)));
    focusBody(restored.scroll);
  }

  function close() {
    setOpened(false);
  }

  function reset() {
    setStack([]);
  }

  return {
    back: previous ? drawerBackLabel(previous) : null,
    close,
    frame,
    open,
    opened,
    pop,
    push,
    reset,
  };
}
