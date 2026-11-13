"use client";

import { floatingDrawerSwipeShouldClose } from "@/lib/ui/floating-drawer";
import { MOTION_DRAWER_EXIT } from "@/lib/ui/motion";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef } from "react";

const INTERACTIVE = "a, button, input, select, textarea, [role='button']";

type Drag = { panel: HTMLElement; pointerId: number; startY: number };

export type FloatingDrawerSwipeHandlers = {
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
};

/**
 * Pointer drag for the bottom sheet. `enabled` is the dismiss guard: a sheet
 * whose caller is ignoring close, or a desktop panel, never commits the gesture.
 * The handle that spreads these handlers stays decorative.
 */
export function useFloatingDrawerSwipe(options: {
  enabled: boolean;
  onClose: () => void;
  reducedMotion: boolean;
}): FloatingDrawerSwipeHandlers {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const drag = useRef<Drag | null>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!optionsRef.current.enabled || event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest(INTERACTIVE)) return;
    const panel = event.currentTarget.closest("[data-ui-overlay]");
    if (!(panel instanceof HTMLElement)) return;
    panel.style.transition = "";
    if (typeof event.currentTarget.setPointerCapture === "function") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // jsdom has no pointer capture. The events in tests are fired on this node.
      }
    }
    drag.current = { panel, pointerId: event.pointerId, startY: event.clientY };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const delta = event.clientY - current.startY;
    current.panel.style.transform = delta > 0 ? `translateY(${delta}px)` : "";
  }

  function finish(event: ReactPointerEvent<HTMLElement>, commit: boolean) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    const delta = event.clientY - current.startY;
    const { enabled, onClose, reducedMotion } = optionsRef.current;
    if (commit && enabled && floatingDrawerSwipeShouldClose(delta)) {
      current.panel.style.transition = "";
      current.panel.style.transform = "";
      onClose();
      return;
    }
    if (current.panel.style.transform === "") return;
    snapBack(current.panel, reducedMotion);
  }

  return {
    onPointerCancel: (event) => finish(event, false),
    onPointerDown,
    onPointerMove,
    onPointerUp: (event) => finish(event, true),
  };
}

function snapBack(panel: HTMLElement, reducedMotion: boolean) {
  if (reducedMotion) {
    panel.style.transform = "";
    return;
  }
  panel.style.transition = `transform ${MOTION_DRAWER_EXIT}ms var(--ease-out)`;
  panel.style.transform = "";
  const clear = () => {
    panel.style.transition = "";
    panel.removeEventListener("transitionend", clear);
  };
  panel.addEventListener("transitionend", clear);
}
