import { applyTheme } from "@/lib/theme/browser-theme";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeSegments } from "./ThemeSegments";

function segment(name: "Light" | "Dark" | "System") {
  return screen.getByRole("button", { name });
}

describe("ThemeSegments", () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie setup mirrors the browser contract.
    document.cookie = "theme=light; path=/";
    document.documentElement.dataset.theme = "light";
    document.body.dataset.theme = "light";
    document.body.innerHTML = '<div data-app-theme-root data-theme="light"></div>';
  });

  it("follows a theme change made outside the control", () => {
    render(<ThemeSegments defaultPreference="light" />);

    act(() => applyTheme("dark"));

    expect(segment("Dark")).toHaveAttribute("aria-pressed", "true");
    expect(segment("Light")).toHaveAttribute("aria-pressed", "false");
  });

  it("stores system as the preference and paints the resolved theme", () => {
    render(<ThemeSegments defaultPreference="light" />);

    fireEvent.click(segment("System"));

    expect(segment("System")).toHaveAttribute("aria-pressed", "true");
    expect(document.cookie).toContain("theme=system");
    // jsdom reports no dark preference, so system resolves to light.
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("gives each segment exactly one accessible name despite the tooltip", () => {
    render(<ThemeSegments />);

    for (const name of ["Light", "Dark", "System"] as const) {
      expect(segment(name)).toHaveAttribute("aria-label", name);
      expect(segment(name)).not.toHaveAttribute("aria-labelledby");
      expect(segment(name)).not.toHaveAttribute("title");
    }
  });

  it("defaults to the system segment when nothing was ever chosen", () => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie cleanup mirrors the browser contract.
    document.cookie = "theme=; path=/; max-age=0";

    render(<ThemeSegments />);

    expect(segment("System")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps every segment at or above the 24px minimum target in both sizes", () => {
    const { rerender } = render(<ThemeSegments size="sm" />);

    expect(segment("Light").className).toContain("h-6");
    expect(segment("Light").className).toContain("w-[26px]");

    rerender(<ThemeSegments size="md" />);

    expect(segment("Light").className).toContain("h-7");
    expect(segment("Light").className).toContain("w-8");
  });

  it("marks the active segment with the solid accent, not the light brand hue", () => {
    render(<ThemeSegments defaultPreference="light" />);

    expect(segment("Light").className).toContain("bg-accent-solid");
    expect(segment("Dark").className).not.toContain("bg-accent");
  });
});
