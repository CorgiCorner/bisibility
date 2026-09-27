"use client";

import type { Options } from "canvas-confetti";
import { useCallback } from "react";

const BURST_MS = 2500;
const COLORS = ["#f1511c", "#ffb088", "#2f7f50", "#f6d7c8", "#f4c542"];
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type ConfettiFire = ((options?: Options) => Promise<null> | null) & { reset: () => void };

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
}

function burstFromSides(confetti: ConfettiFire) {
  const y = 0.15 + Math.random() * 0.7;
  const shared = {
    colors: COLORS,
    disableForReducedMotion: true,
    particleCount: 2,
    spread: 55,
    startVelocity: 60,
    ticks: 180,
    zIndex: 40,
  } satisfies Options;
  confetti({ ...shared, angle: 60, origin: { x: 0, y } });
  confetti({ ...shared, angle: 120, origin: { x: 1, y } });
}

export function SetupSuccessConfetti() {
  const bindAnchor = useCallback((node: HTMLSpanElement | null) => {
    if (!node || prefersReducedMotion()) return;

    let frame = 0;
    let cancelled = false;
    let reset: (() => void) | undefined;
    const started = performance.now();

    void import("canvas-confetti")
      .then((mod) => {
        if (cancelled) return;
        const confetti = mod.default as ConfettiFire;
        reset = () => confetti.reset();
        const tick = () => {
          if (cancelled || performance.now() - started > BURST_MS) return;
          try {
            burstFromSides(confetti);
          } catch {
            cancelled = true;
            return;
          }
          frame = window.requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      reset?.();
    };
  }, []);

  return <span aria-hidden ref={bindAnchor} />;
}
