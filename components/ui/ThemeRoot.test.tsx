import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeRoot } from "./ThemeRoot";

// `act` from react needs this flag outside React Testing Library's own render path.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("ThemeRoot", () => {
  it("marks the element the theme scripts paint", () => {
    const markup = renderToString(
      <ThemeRoot className="min-h-dvh" data-theme="light">
        content
      </ThemeRoot>,
    );

    expect(markup).toContain("data-app-theme-root");
    expect(markup).toContain('data-theme="light"');
    expect(markup).toContain('class="min-h-dvh"');
  });

  it("hydrates after the pre-paint script stamped a theme the server did not render", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<ThemeRoot>content</ThemeRoot>);
    document.body.appendChild(container);

    // `theme-init` runs from the App Router bootstrap queue after the body is parsed, so the
    // shell root is already painted by the time React hydrates it.
    const shellRoot = container.querySelector<HTMLElement>("[data-app-theme-root]");
    shellRoot?.setAttribute("data-theme", "dark");

    const recoverable: unknown[] = [];
    const consoleErrors: unknown[][] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args) => {
      consoleErrors.push(args);
    });

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <ThemeRoot>content</ThemeRoot>, {
        onRecoverableError: (error) => {
          recoverable.push(error);
        },
      });
    });
    consoleError.mockRestore();

    expect(recoverable.map((error) => String(error))).toEqual([]);
    expect(consoleErrors.map((args) => String(args[0]))).toEqual([]);
    // The painted value survives hydration: React never owns this attribute.
    expect(shellRoot).toHaveAttribute("data-theme", "dark");

    await act(async () => {
      root?.unmount();
    });
  });
});
