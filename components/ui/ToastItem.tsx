"use client";

import { EASE_OUT, MOTION_TOAST_ENTER, MOTION_TOAST_EXIT } from "@/lib/ui/motion";
import type { ReactNode } from "react";
import { useCallback } from "react";
import type { ToastTint } from "./Toast";

export type ToastPhase = "entering" | "visible" | "exiting";

export type ToastEntry = {
  id: number;
  message: ReactNode;
  icon: ReactNode;
  tint: ToastTint;
  undo?: () => Promise<void> | void;
  phase: ToastPhase;
  durationMs: number;
  undoPending: boolean;
};

type ToastItemProps = {
  toast: ToastEntry;
  reducedMotion: boolean;
  onEntered: (id: number) => void;
  onExited: (id: number) => void;
  onUndoClick: (id: number) => void;
  onPauseHover: (id: number) => void;
  onResumeHover: (id: number) => void;
  onPauseFocus: (id: number) => void;
  onResumeFocus: (id: number) => void;
};

type TintStyle = {
  color: string;
  soft: string;
  border: string;
};

const tintStyles = {
  accent: {
    border: "color-mix(in srgb, var(--accent) 28%, var(--border))",
    color: "var(--accent-text)",
    soft: "var(--accent-soft)",
  },
  blue: {
    border: "color-mix(in srgb, var(--blue) 28%, var(--border))",
    color: "var(--blue)",
    soft: "color-mix(in srgb, var(--blue) 12%, transparent)",
  },
  green: {
    border: "color-mix(in srgb, var(--green) 28%, var(--border))",
    color: "var(--green-text)",
    soft: "color-mix(in srgb, var(--green) 12%, transparent)",
  },
  neutral: {
    border: "var(--border-strong)",
    color: "var(--fg-muted)",
    soft: "var(--bg-sunken)",
  },
  purple: {
    border: "color-mix(in srgb, var(--purple) 28%, var(--border))",
    color: "var(--purple)",
    soft: "color-mix(in srgb, var(--purple) 12%, transparent)",
  },
  red: {
    border: "color-mix(in srgb, var(--red) 28%, var(--border))",
    color: "var(--red)",
    soft: "color-mix(in srgb, var(--red) 12%, transparent)",
  },
  yellow: {
    border: "color-mix(in srgb, var(--yellow) 32%, var(--border))",
    color: "var(--yellow-text)",
    soft: "color-mix(in srgb, var(--yellow) 14%, transparent)",
  },
} satisfies Record<ToastTint, TintStyle>;

const BUFFER = 50;
const ENTER_OFFSET = 8;
const EXIT_OFFSET = 8;

function applyTransition(node: HTMLElement, durationMs: number, reduced: boolean): void {
  node.style.transitionProperty = reduced ? "opacity" : "opacity, transform";
  node.style.transitionTimingFunction = EASE_OUT;
  node.style.transitionDuration = reduced ? "0ms" : `${durationMs}ms`;
}

export function ToastItem({
  toast,
  reducedMotion,
  onEntered,
  onExited,
  onUndoClick,
  onPauseHover,
  onResumeHover,
  onPauseFocus,
  onResumeFocus,
}: Readonly<ToastItemProps>) {
  const setRootRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return undefined;

      if (toast.phase === "exiting") {
        applyTransition(node, MOTION_TOAST_EXIT, reducedMotion);
        if (reducedMotion) {
          node.style.opacity = "0";
          node.style.transform = "none";
          const raf = requestAnimationFrame(() => onExited(toast.id));
          return () => cancelAnimationFrame(raf);
        }
        const raf = requestAnimationFrame(() => {
          node.style.opacity = "0";
          node.style.transform = `translateY(${EXIT_OFFSET}px)`;
        });
        const onEnd = (e: TransitionEvent) => {
          if (e.target !== node || e.propertyName !== "opacity") return;
          onExited(toast.id);
        };
        node.addEventListener("transitionend", onEnd);
        const fallback = setTimeout(() => onExited(toast.id), MOTION_TOAST_EXIT + BUFFER);
        return () => {
          cancelAnimationFrame(raf);
          node.removeEventListener("transitionend", onEnd);
          clearTimeout(fallback);
        };
      }

      if (toast.phase === "entering") {
        node.style.opacity = "0";
        node.style.transform = reducedMotion ? "none" : `translateY(${ENTER_OFFSET}px)`;
        applyTransition(node, MOTION_TOAST_ENTER, reducedMotion);
        if (reducedMotion) {
          node.style.opacity = "1";
          const raf = requestAnimationFrame(() => onEntered(toast.id));
          return () => cancelAnimationFrame(raf);
        }
        let settleRaf: number | undefined;
        const paintRaf = requestAnimationFrame(() => {
          settleRaf = requestAnimationFrame(() => {
            node.style.opacity = "1";
            node.style.transform = "translateY(0)";
          });
        });
        const onEnd = (e: TransitionEvent) => {
          if (e.target !== node || e.propertyName !== "opacity") return;
          onEntered(toast.id);
        };
        node.addEventListener("transitionend", onEnd);
        const fallback = setTimeout(() => onEntered(toast.id), MOTION_TOAST_ENTER + BUFFER);
        return () => {
          cancelAnimationFrame(paintRaf);
          if (settleRaf !== undefined) cancelAnimationFrame(settleRaf);
          node.removeEventListener("transitionend", onEnd);
          clearTimeout(fallback);
        };
      }

      return undefined;
    },
    [toast.phase, toast.id, reducedMotion, onEntered, onExited],
  );

  const style = tintStyles[toast.tint];

  function handleMouseEnter() {
    if (toast.undo) onPauseHover(toast.id);
  }

  function handleMouseLeave() {
    if (toast.undo) onResumeHover(toast.id);
  }

  function handleFocusCapture() {
    if (toast.undo) onPauseFocus(toast.id);
  }

  function handleBlurCapture(e: React.FocusEvent<HTMLElement>) {
    if (!toast.undo) return;
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    onResumeFocus(toast.id);
  }

  return (
    <output
      className="pointer-events-auto flex w-full max-w-[calc(100vw-32px)] items-center gap-3 rounded-[14px] border bg-bg-elev px-3.5 py-3 text-fg sm:max-w-none"
      onBlurCapture={handleBlurCapture}
      onFocusCapture={handleFocusCapture}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      ref={setRootRef}
      style={{ borderColor: style.border }}
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
        style={{ backgroundColor: style.soft, color: style.color }}
      >
        {toast.icon}
      </span>
      <p className="m-0 min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-fg">
        {toast.message}
      </p>
      {toast.undo ? (
        <button
          className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-semibold outline-none transition-colors hover:bg-bg-sunken focus-visible:bg-bg-sunken"
          disabled={toast.undoPending}
          onClick={() => onUndoClick(toast.id)}
          style={{ color: style.color }}
          type="button"
        >
          Undo
        </button>
      ) : null}
    </output>
  );
}
