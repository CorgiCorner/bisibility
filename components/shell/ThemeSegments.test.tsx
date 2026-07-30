import { applyTheme } from "@/components/shell/set-theme";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeSegments } from "./ThemeSegments";

describe("ThemeSegments", () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie setup mirrors the browser contract.
    document.cookie = "theme=light; path=/";
    document.documentElement.dataset.theme = "light";
    document.body.dataset.theme = "light";
    document.body.innerHTML = '<div data-app-theme-root data-theme="light"></div>';
  });

  it("follows a theme change made outside the sidebar control", () => {
    render(<ThemeSegments defaultTheme="light" />);

    act(() => applyTheme("dark"));

    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");
  });
});
