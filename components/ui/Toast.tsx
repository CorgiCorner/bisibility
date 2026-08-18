"use client";

import useMediaQuery from "@mui/material/useMediaQuery";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { type ToastEntry, ToastItem } from "./ToastItem";
import { createToastLifecycle, type ToastLifecycle } from "./toast-lifecycle";

export type ToastTint = "accent" | "blue" | "green" | "neutral" | "purple" | "red" | "yellow";

export type ToastOptions = {
  icon?: ReactNode;
  tint?: ToastTint;
  undo?: () => Promise<void> | void;
};

export type ToastContextValue = {
  showToast: (message: ReactNode, options?: ToastOptions) => void;
};

type ToastProviderProps = {
  children: ReactNode;
};

const TOAST_DURATION = 3200;
const ERROR_TOAST_DURATION = 8000;
const UNDO_TOAST_DURATION = 6000;
const UNDO_ERROR_MESSAGE = "Undo failed. Please try again.";

const fallbackToastContext: ToastContextValue = {
  showToast: () => undefined,
};

const ToastContext = createContext<ToastContextValue | null>(null);

function defaultIcon(tint: ToastTint) {
  return <CheckCircle aria-hidden size={18} weight={tint === "neutral" ? "regular" : "bold"} />;
}

export function ToastProvider({ children }: Readonly<ToastProviderProps>) {
  const [toasts, setToastsState] = useState<ToastEntry[]>([]);
  const toastsRef = useRef<ToastEntry[]>([]);
  const lifecyclesRef = useRef(new Map<number, ToastLifecycle>());
  const mountedRef = useRef(false);
  const nextIdRef = useRef(1);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", {
    noSsr: true,
  });

  const updateToasts = useCallback((updater: (current: ToastEntry[]) => ToastEntry[]) => {
    setToastsState((current) => {
      const next = updater(current);
      toastsRef.current = next;
      return next;
    });
  }, []);

  const handleExpired = useCallback(
    (id: number) => {
      if (!mountedRef.current) return;
      updateToasts((current) =>
        current.map((t) => (t.id === id && t.phase !== "exiting" ? { ...t, phase: "exiting" } : t)),
      );
    },
    [updateToasts],
  );

  const handleExited = useCallback(
    (id: number) => {
      if (!mountedRef.current) return;
      const lifecycle = lifecyclesRef.current.get(id);
      if (lifecycle) {
        lifecycle.dispose();
        lifecyclesRef.current.delete(id);
      }
      updateToasts((current) => current.filter((t) => t.id !== id));
    },
    [updateToasts],
  );

  const handleEntered = useCallback(
    (id: number) => {
      if (!mountedRef.current) return;
      const toast = toastsRef.current.find((t) => t.id === id);
      if (toast?.phase !== "entering") return;
      const lifecycle = lifecyclesRef.current.get(id) ?? createToastLifecycle();
      if (!lifecyclesRef.current.has(id)) lifecyclesRef.current.set(id, lifecycle);
      lifecycle.start(toast.durationMs, () => handleExpired(id));
      if (toast.undoPending) {
        lifecycle.pause("undo");
      }
      updateToasts((current) => current.map((t) => (t.id === id ? { ...t, phase: "visible" } : t)));
    },
    [updateToasts, handleExpired],
  );

  const handleUndoReject = useCallback(
    (id: number) => {
      if (!mountedRef.current) return;
      const toast = toastsRef.current.find((t) => t.id === id);
      if (!toast) return;
      const old = lifecyclesRef.current.get(id);
      if (old) {
        old.dispose();
        lifecyclesRef.current.delete(id);
      }
      if (toast.phase === "visible") {
        const lifecycle = createToastLifecycle();
        lifecyclesRef.current.set(id, lifecycle);
        lifecycle.start(ERROR_TOAST_DURATION, () => handleExpired(id));
        if (typeof document !== "undefined" && document.hidden) {
          lifecycle.pause("hidden");
        }
      }
      updateToasts((current) =>
        current.map((t) =>
          t.id === id
            ? {
                ...t,
                durationMs: ERROR_TOAST_DURATION,
                message: UNDO_ERROR_MESSAGE,
                tint: "red",
                undo: undefined,
                undoPending: false,
              }
            : t,
        ),
      );
    },
    [updateToasts, handleExpired],
  );

  const handleUndoClick = useCallback(
    (id: number) => {
      const toast = toastsRef.current.find((t) => t.id === id);
      if (!toast?.undo || toast.undoPending || toast.phase === "exiting") return;
      const undo = toast.undo;
      lifecyclesRef.current.get(id)?.pause("undo");
      updateToasts((current) =>
        current.map((t) => (t.id === id ? { ...t, undoPending: true } : t)),
      );
      new Promise<void>((resolve) => resolve(undo()))
        .then(() => {
          if (!mountedRef.current) return;
          handleExpired(id);
        })
        .catch(() => {
          if (!mountedRef.current) return;
          handleUndoReject(id);
        });
    },
    [updateToasts, handleExpired, handleUndoReject],
  );

  const handlePauseHover = useCallback((id: number) => {
    lifecyclesRef.current.get(id)?.pause("hover");
  }, []);

  const handleResumeHover = useCallback((id: number) => {
    lifecyclesRef.current.get(id)?.resume("hover");
  }, []);

  const handlePauseFocus = useCallback((id: number) => {
    lifecyclesRef.current.get(id)?.pause("focus");
  }, []);

  const handleResumeFocus = useCallback((id: number) => {
    lifecyclesRef.current.get(id)?.resume("focus");
  }, []);

  const showToast = useCallback(
    (message: ReactNode, options: ToastOptions = {}) => {
      if (!mountedRef.current) return;
      const tint = options.tint ?? "accent";
      const id = nextIdRef.current++;
      const durationMs = options.undo
        ? UNDO_TOAST_DURATION
        : tint === "red"
          ? ERROR_TOAST_DURATION
          : TOAST_DURATION;
      const entry: ToastEntry = {
        durationMs,
        icon: options.icon ?? defaultIcon(tint),
        id,
        message,
        phase: "entering",
        tint,
        undo: options.undo,
        undoPending: false,
      };
      const lifecycle = createToastLifecycle();
      if (typeof document !== "undefined" && document.hidden) lifecycle.pause("hidden");
      lifecyclesRef.current.set(id, lifecycle);
      updateToasts((current) => [...current, entry]);
    },
    [updateToasts],
  );

  const setMountedRef = useCallback((node: HTMLSpanElement | null) => {
    mountedRef.current = node !== null;
    if (node !== null) {
      return () => {
        mountedRef.current = false;
        for (const lifecycle of lifecyclesRef.current.values()) {
          lifecycle.dispose();
        }
        lifecyclesRef.current.clear();
      };
    }
    return undefined;
  }, []);

  const setLiveRegionRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return undefined;
    const doc = node.ownerDocument;
    const onVisibilityChange = () => {
      if (doc.hidden) {
        for (const lifecycle of lifecyclesRef.current.values()) {
          lifecycle.pause("hidden");
        }
      } else {
        for (const lifecycle of lifecyclesRef.current.values()) {
          lifecycle.resume("hidden");
        }
      }
    };
    doc.addEventListener("visibilitychange", onVisibilityChange);
    if (doc.hidden) {
      for (const lifecycle of lifecyclesRef.current.values()) {
        lifecycle.pause("hidden");
      }
    }
    return () => {
      doc.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <span aria-hidden="true" ref={setMountedRef} style={{ display: "none" }} />
      {toasts.length > 0 ? (
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-4 bottom-4 z-1600 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[360px]"
          ref={setLiveRegionRef}
        >
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              onEntered={handleEntered}
              onExited={handleExited}
              onPauseFocus={handlePauseFocus}
              onPauseHover={handlePauseHover}
              onResumeFocus={handleResumeFocus}
              onResumeHover={handleResumeHover}
              onUndoClick={handleUndoClick}
              reducedMotion={reducedMotion}
              toast={toast}
            />
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) ?? fallbackToastContext;
}
