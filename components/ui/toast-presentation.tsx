"use client";

import {
  CheckCircleIcon,
  CircleNotchIcon,
  InfoIcon,
  PlugsIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";

export type ToastSeverity = "success" | "error" | "warning" | "info" | "connection" | "progress";

type ToastTint = "accent" | "blue" | "green" | "purple" | "red" | "yellow";

type ToastPresentation = {
  durationMs: number;
  iconName:
    | "CheckCircleIcon"
    | "XCircleIcon"
    | "WarningIcon"
    | "InfoIcon"
    | "PlugsIcon"
    | "CircleNotchIcon";
  tint: ToastTint;
};

// Severity owns glyph, tint, and base duration so callers cannot create conflicting signals.
export const toastPresentations = {
  success: { durationMs: 3200, iconName: "CheckCircleIcon", tint: "green" },
  error: { durationMs: 8000, iconName: "XCircleIcon", tint: "red" },
  warning: { durationMs: 6000, iconName: "WarningIcon", tint: "yellow" },
  info: { durationMs: 3200, iconName: "InfoIcon", tint: "blue" },
  connection: { durationMs: 6000, iconName: "PlugsIcon", tint: "purple" },
  progress: { durationMs: 8000, iconName: "CircleNotchIcon", tint: "accent" },
} as const satisfies Record<ToastSeverity, ToastPresentation>;

export function toastIcon(severity: ToastSeverity) {
  const props = { "aria-hidden": true, size: 18, weight: "regular" };
  switch (severity) {
    case "success":
      return <CheckCircleIcon {...props} weight="regular" />;
    case "error":
      return <XCircleIcon {...props} weight="regular" />;
    case "warning":
      return <WarningIcon {...props} weight="regular" />;
    case "info":
      return <InfoIcon {...props} weight="regular" />;
    case "connection":
      return <PlugsIcon {...props} weight="regular" />;
    case "progress":
      return <CircleNotchIcon {...props} className="animate-spin" weight="regular" />;
  }
}
