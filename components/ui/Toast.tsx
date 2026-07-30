"use client";

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

export type ToastTint = "accent" | "blue" | "green" | "neutral" | "purple" | "red" | "yellow";

export type ToastOptions = {
  icon?: ReactNode;
  tint?: ToastTint;
  undo?: () => Promise<void> | void;
};

export type ToastContextValue = {
  showToast: (message: ReactNode, options?: ToastOptions) => void;
};

type ToastState = {
  id: number;
  message: ReactNode;
  icon: ReactNode;
  tint: ToastTint;
  undo?: () => Promise<void> | void;
};

type ToastProviderProps = {
  children: ReactNode;
};

type TintStyle = {
  color: string;
  soft: string;
  border: string;
};

const TOAST_DURATION = 3200;
const ERROR_TOAST_DURATION = 8000;
const UNDO_TOAST_DURATION = 6000;

const tintStyles = {
  accent: {
    border: "color-mix(in srgb, var(--accent) 28%, var(--border))",
    color: "var(--accent)",
    soft: "var(--accent-soft)",
  },
  blue: {
    border: "color-mix(in srgb, var(--blue) 28%, var(--border))",
    color: "var(--blue)",
    soft: "color-mix(in srgb, var(--blue) 12%, transparent)",
  },
  green: {
    border: "color-mix(in srgb, var(--green) 28%, var(--border))",
    color: "var(--green)",
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
    color: "var(--yellow-strong)",
    soft: "color-mix(in srgb, var(--yellow) 14%, transparent)",
  },
} satisfies Record<ToastTint, TintStyle>;

const fallbackToastContext: ToastContextValue = {
  showToast: () => undefined,
};

const ToastContext = createContext<ToastContextValue | null>(null);

function defaultIcon(tint: ToastTint) {
  return <CheckCircle aria-hidden size={18} weight={tint === "neutral" ? "regular" : "bold"} />;
}

export function ToastProvider({ children }: Readonly<ToastProviderProps>) {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const nextToastIdRef = useRef(1);
  const timerRefs = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  function dismissToast(id: number) {
    const timer = timerRefs.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timerRefs.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  const showToast = useCallback((message: ReactNode, options: ToastOptions = {}) => {
    const tint = options.tint ?? "accent";
    const id = nextToastIdRef.current++;
    const nextToast = {
      id,
      icon: options.icon ?? defaultIcon(tint),
      message,
      tint,
      undo: options.undo,
    };
    setToasts((current) => [...current, nextToast]);

    const duration = options.undo
      ? UNDO_TOAST_DURATION
      : tint === "red"
        ? ERROR_TOAST_DURATION
        : TOAST_DURATION;
    const timer = setTimeout(() => {
      timerRefs.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, duration);
    timerRefs.current.set(id, timer);
  }, []);

  function handleUndo(toast: ToastState) {
    if (!toast.undo) return;
    const undo = toast.undo;
    dismissToast(toast.id);
    Promise.resolve(undo()).catch(() => undefined);
  }

  const contextValue = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {toasts.length ? (
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-4 bottom-4 z-1600 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[360px]"
        >
          {toasts.map((toast) => {
            const style = tintStyles[toast.tint];
            return (
              <output
                className="pointer-events-auto flex w-full max-w-[calc(100vw-32px)] items-center gap-3 rounded-[14px] border bg-bg-elev px-3.5 py-3 text-fg sm:max-w-none"
                key={toast.id}
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
                    onClick={() => handleUndo(toast)}
                    style={{ color: style.color }}
                    type="button"
                  >
                    Undo
                  </button>
                ) : null}
              </output>
            );
          })}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) ?? fallbackToastContext;
}
