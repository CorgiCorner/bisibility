import { HeadManagerContext } from "next/dist/shared/lib/head-manager-context.shared-runtime";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InlineScript } from "./InlineScript";

describe("InlineScript", () => {
  it("does not trigger React's script warning during a fresh client render", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const consoleError = vi.spyOn(console, "error");

    try {
      await act(async () => {
        root.render(
          <HeadManagerContext.Provider value={{ appDir: true }}>
            <InlineScript id="pre-paint-init" html="window.__prePaintInitializer = true;" />
          </HeadManagerContext.Provider>,
        );
      });

      const queueScript = container.querySelector("script");
      expect(queueScript?.textContent).toContain("(self.__next_s=self.__next_s||[]).push(");
      expect(queueScript?.textContent).toContain('"id":"pre-paint-init"');

      const messages = consoleError.mock.calls.map(([message]) => String(message));
      expect(
        messages.some((message) =>
          message.includes("Encountered a script tag while rendering React component"),
        ),
      ).toBe(false);
    } finally {
      await act(async () => root.unmount());
      consoleError.mockRestore();
    }
  });

  it("serializes an inline initializer into the App Router beforeInteractive queue", () => {
    const markup = renderToStaticMarkup(
      <HeadManagerContext.Provider value={{ appDir: true }}>
        <InlineScript id="pre-paint-init" html="window.__prePaintInitializer = true;" />
      </HeadManagerContext.Provider>,
    );

    expect(markup).toContain("(self.__next_s=self.__next_s||[]).push(");
    expect(markup).toContain('"id":"pre-paint-init"');
    expect(markup).toContain("window.__prePaintInitializer = true;");
    expect(markup).not.toContain('type="text/plain"');
  });
});
