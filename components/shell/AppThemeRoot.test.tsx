import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppThemeRoot } from "./AppThemeRoot";

describe("AppThemeRoot", () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom cookie setup mirrors the browser contract.
    document.cookie = "theme=dark; path=/";
    document.documentElement.dataset.theme = "dark";
    document.body.dataset.theme = "dark";
  });

  it("does not let a stale server default clobber the current browser theme", () => {
    const { rerender } = render(
      <AppThemeRoot data-testid="theme-root" defaultTheme="light">
        first
      </AppThemeRoot>,
    );

    expect(screen.getByTestId("theme-root")).toHaveAttribute("data-theme", "dark");

    rerender(
      <AppThemeRoot data-testid="theme-root" defaultTheme="light">
        second
      </AppThemeRoot>,
    );

    expect(screen.getByTestId("theme-root")).toHaveAttribute("data-theme", "dark");
  });

  it.each([
    ["an absent cookie", undefined, "false"],
    ['cookie "true"', "true", "true"],
    ['cookie "false"', "false", "false"],
  ])(
    "sets the expected initial sidebar state for %s",
    (_scenario, dataCollapsed, expectedCollapsed) => {
      render(
        <AppThemeRoot
          data-collapsed={dataCollapsed}
          data-testid="theme-root"
          defaultTheme="light"
        />,
      );

      expect(screen.getByTestId("theme-root")).toHaveAttribute("data-collapsed", expectedCollapsed);
    },
  );
});
