"use client";

import { EASE_OUT, MOTION_TOOLTIP } from "@/lib/ui/motion";
import Fade from "@mui/material/Fade";
import { type ReactNode, useCallback, useRef } from "react";

const SCALE_START = 0.97;

export type TooltipTransitionProps = {
  in: boolean;
  warm: boolean;
  reducedMotion: boolean;
  children: ReactNode;
  appear?: boolean;
  mountOnEnter?: boolean;
  unmountOnExit?: boolean;
  onEnter?: (node: HTMLElement, isAppearing: boolean) => void;
  onExit?: (node: HTMLElement) => void;
  onEntering?: (node: HTMLElement, isAppearing: boolean) => void;
  onEntered?: (node: HTMLElement, isAppearing: boolean) => void;
  onExiting?: (node: HTMLElement) => void;
  onExited?: (node: HTMLElement) => void;
};

export function TooltipTransition({
  in: inProp,
  warm,
  reducedMotion,
  children,
  onEnter,
  onExit,
  onExited,
  ...rest
}: Readonly<TooltipTransitionProps>) {
  const rafRef = useRef<number | undefined>(undefined);
  const animate = !warm && !reducedMotion;

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
  }, []);

  const transition = animate
    ? `opacity ${MOTION_TOOLTIP}ms ${EASE_OUT}, transform ${MOTION_TOOLTIP}ms ${EASE_OUT}`
    : "none";

  const setTransitionRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return undefined;
      return cancelRaf;
    },
    [cancelRaf],
  );

  return (
    <Fade
      {...rest}
      easing={EASE_OUT}
      in={inProp}
      onEnter={(node, isAppearing) => {
        cancelRaf();
        if (animate) {
          node.style.transition = "none";
          node.style.webkitTransition = "none";
          node.style.transform = `scale(${SCALE_START})`;
          void node.offsetHeight;
          node.style.transition = transition;
          node.style.webkitTransition = transition;
          rafRef.current = requestAnimationFrame(() => {
            node.style.transform = "scale(1)";
            rafRef.current = undefined;
          });
        } else {
          node.style.transition = "none";
          node.style.webkitTransition = "none";
          node.style.transform = "none";
        }
        onEnter?.(node, isAppearing);
      }}
      onExit={(node) => {
        cancelRaf();
        node.style.transition = transition;
        node.style.webkitTransition = transition;
        node.style.transform = animate ? `scale(${SCALE_START})` : "none";
        onExit?.(node);
      }}
      onExited={(node) => {
        cancelRaf();
        node.style.transform = "";
        onExited?.(node);
      }}
      timeout={animate ? MOTION_TOOLTIP : 0}
    >
      <div ref={setTransitionRef} style={{ transformOrigin: "center" }}>
        {children}
      </div>
    </Fade>
  );
}
