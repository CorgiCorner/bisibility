import { render, screen } from "@testing-library/react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalTokenDateLabels } from "./PersonalTokenDateLabels";
import { PersonalTokensSection } from "./PersonalTokensSection";

describe("PersonalTokensSection", () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it("formats project-less token dates in the viewer browser timezone", () => {
    process.env.TZ = "America/New_York";

    render(
      <PersonalTokensSection
        dateFormat="long"
        issueToken={vi.fn()}
        revokeToken={vi.fn()}
        tokens={[
          {
            createdAt: "2026-06-20T01:30:00.000Z",
            expiresAt: null,
            id: "pat_abcdefghijklmnopqrstuvwx",
            lastUsedAt: null,
            maskedValue: "bsb_pat_live_******",
            name: "Automation",
            scope: "read",
          },
        ]}
      />,
    );

    expect(screen.getByText(/created Jun 19, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/never used/)).toBeInTheDocument();
    expect(screen.getByText(/never expires/)).toBeInTheDocument();
  });

  it("replaces the UTC server date with the browser date after hydration", async () => {
    process.env.TZ = "America/New_York";
    const props = {
      dateFormat: "long" as const,
      token: {
        createdAt: "2026-06-20T01:30:00.000Z",
        expiresAt: null,
        lastUsedAt: null,
      },
    };
    const savedWindow = globalThis.window;
    let markup: string;
    try {
      // @ts-expect-error: simulate server environment for SSR
      globalThis.window = undefined;
      markup = renderToString(<PersonalTokenDateLabels {...props} />);
    } finally {
      globalThis.window = savedWindow;
    }
    const container = document.createElement("div");
    container.innerHTML = markup;
    document.body.append(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = hydrateRoot(container, <PersonalTokenDateLabels {...props} />);

    expect(container).toHaveTextContent("created Jun 20, 2026");
    await act(async () => undefined);
    expect(container).toHaveTextContent("created Jun 19, 2026");
    expect(consoleError).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    consoleError.mockRestore();
    container.remove();
  });
});
