"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { ToastSeverity } from "./toast-presentation";

export type ToastOptions = {
  severity?: ToastSeverity;
  undo?: () => Promise<void> | void;
};

export type ToastContextValue = {
  showToast: (message: ReactNode, options?: ToastOptions) => void;
};

const fallbackToastContext: ToastContextValue = { showToast: () => undefined };
export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  return useContext(ToastContext) ?? fallbackToastContext;
}
