import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type ToastSeverity, toastIcon, toastPresentations } from "./toast-presentation";

const expected = {
  success: { durationMs: 3200, iconName: "CheckCircleIcon", tint: "green" },
  error: { durationMs: 8000, iconName: "XCircleIcon", tint: "red" },
  warning: { durationMs: 6000, iconName: "WarningIcon", tint: "yellow" },
  info: { durationMs: 3200, iconName: "InfoIcon", tint: "blue" },
  connection: { durationMs: 6000, iconName: "PlugsIcon", tint: "purple" },
  progress: { durationMs: 8000, iconName: "CircleNotchIcon", tint: "accent" },
} as const satisfies Record<ToastSeverity, (typeof toastPresentations)[ToastSeverity]>;

describe("toast severity presentation", () => {
  it("maps the exact severity set to canonical glyph, tint, and duration", () => {
    expect(toastPresentations).toEqual(expected);
    expect(Object.keys(toastPresentations)).toEqual(Object.keys(expected));
  });

  it("animates only the progress glyph", () => {
    for (const severity of Object.keys(expected) as ToastSeverity[]) {
      const { container, unmount } = render(toastIcon(severity));
      expect(container.querySelector("svg")?.classList.contains("animate-spin")).toBe(
        severity === "progress",
      );
      unmount();
    }
  });
});
