"use client";

import { useMediaQuery } from "@/lib/ui/use-media-query";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { type ToastEntry, ToastItem } from "./ToastItem";
import { ToastContext, type ToastOptions } from "./toast-context";
import { createToastLifecycle, type ToastLifecycle } from "./toast-lifecycle";
import { toastPresentations } from "./toast-presentation";

export { type ToastContextValue, type ToastOptions, useToast } from "./toast-context";

type ToastProviderProps = { children: ReactNode };

const UNDO_TOAST_DURATION = 6000;
const UNDO_ERROR_MESSAGE = "Undo failed. Please try again.";

export function ToastProvider({ children }: Readonly<ToastProviderProps>) {
  const [toasts, setToastsState] = useState<ToastEntry[]>([]);
  const toastsRef = useRef<ToastEntry[]>([]);
  const lifecyclesRef = useRef(new Map<number, ToastLifecycle>());
  const mountedRef = useRef(false);
  const nextIdRef = useRef(1);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

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
        current.map((toast) =>
          toast.id === id && toast.phase !== "exiting" ? { ...toast, phase: "exiting" } : toast,
        ),
      );
    },
    [updateToasts],
  );

  const handleExited = useCallback(
    (id: number) => {
      if (!mountedRef.current) return;
      lifecyclesRef.current.get(id)?.dispose();
      lifecyclesRef.current.delete(id);
      updateToasts((current) => current.filter((toast) => toast.id !== id));
    },
    [updateToasts],
  );

  const handleEntered = useCallback(
    (id: number) => {
      if (!mountedRef.current) return;
      const toast = toastsRef.current.find((entry) => entry.id === id);
      if (toast?.phase !== "entering") return;
      const lifecycle = lifecyclesRef.current.get(id) ?? createToastLifecycle();
      if (!lifecyclesRef.current.has(id)) lifecyclesRef.current.set(id, lifecycle);
      lifecycle.start(toast.durationMs, () => handleExpired(id));
      if (toast.undoPending) lifecycle.pause("undo");
      updateToasts((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, phase: "visible" } : entry)),
      );
    },
    [updateToasts, handleExpired],
  );

  const handleUndoReject = useCallback(
    (id: number) => {
      if (!mountedRef.current) return;
      const toast = toastsRef.current.find((entry) => entry.id === id);
      if (!toast) return;
      lifecyclesRef.current.get(id)?.dispose();
      lifecyclesRef.current.delete(id);
      const durationMs = toastPresentations.error.durationMs;
      if (toast.phase === "visible") {
        const lifecycle = createToastLifecycle();
        lifecyclesRef.current.set(id, lifecycle);
        lifecycle.start(durationMs, () => handleExpired(id));
        if (typeof document !== "undefined" && document.hidden) lifecycle.pause("hidden");
      }
      updateToasts((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                durationMs,
                message: UNDO_ERROR_MESSAGE,
                severity: "error",
                undo: undefined,
                undoPending: false,
              }
            : entry,
        ),
      );
    },
    [updateToasts, handleExpired],
  );

  const handleUndoClick = useCallback(
    (id: number) => {
      const toast = toastsRef.current.find((entry) => entry.id === id);
      if (!toast?.undo || toast.undoPending || toast.phase === "exiting") return;
      const undo = toast.undo;
      lifecyclesRef.current.get(id)?.pause("undo");
      updateToasts((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, undoPending: true } : entry)),
      );
      new Promise<void>((resolve) => resolve(undo()))
        .then(() => {
          if (mountedRef.current) handleExpired(id);
        })
        .catch(() => {
          if (mountedRef.current) handleUndoReject(id);
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
      const severity = options.severity ?? "info";
      const baseDuration = toastPresentations[severity].durationMs;
      const entry: ToastEntry = {
        durationMs: options.undo ? Math.max(baseDuration, UNDO_TOAST_DURATION) : baseDuration,
        id: nextIdRef.current++,
        message,
        phase: "entering",
        severity,
        undo: options.undo,
        undoPending: false,
      };
      const lifecycle = createToastLifecycle();
      if (typeof document !== "undefined" && document.hidden) lifecycle.pause("hidden");
      lifecyclesRef.current.set(entry.id, lifecycle);
      updateToasts((current) => [...current, entry]);
    },
    [updateToasts],
  );

  const setMountedRef = useCallback((node: HTMLSpanElement | null) => {
    mountedRef.current = node !== null;
    if (node === null) return undefined;
    return () => {
      mountedRef.current = false;
      for (const lifecycle of lifecyclesRef.current.values()) lifecycle.dispose();
      lifecyclesRef.current.clear();
    };
  }, []);

  const setLiveRegionRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return undefined;
    const doc = node.ownerDocument;
    const onVisibilityChange = () => {
      for (const lifecycle of lifecyclesRef.current.values()) {
        if (doc.hidden) lifecycle.pause("hidden");
        else lifecycle.resume("hidden");
      }
    };
    doc.addEventListener("visibilitychange", onVisibilityChange);
    if (doc.hidden) onVisibilityChange();
    return () => doc.removeEventListener("visibilitychange", onVisibilityChange);
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
