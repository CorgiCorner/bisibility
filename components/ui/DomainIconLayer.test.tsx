import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DomainIconLayer } from "./DomainIconLayer";

function loadProbe(image: HTMLElement, width: number, height: number) {
  Object.defineProperties(image, {
    naturalHeight: { configurable: true, value: height },
    naturalWidth: { configurable: true, value: width },
  });
  fireEvent.load(image);
}

describe("DomainIconLayer", () => {
  it("resets the painted layer until a changed source is verified", () => {
    const { rerender } = render(
      <DomainIconLayer size={64} src="https://icons.example.com/first.png" testId="domain-icon" />,
    );
    loadProbe(screen.getByTestId("domain-icon-probe"), 32, 32);
    expect(screen.getByTestId("domain-icon")).toHaveStyle({
      backgroundImage: 'url("https://icons.example.com/first.png")',
    });

    rerender(
      <DomainIconLayer size={64} src="https://icons.example.com/second.png" testId="domain-icon" />,
    );

    expect(screen.queryByTestId("domain-icon")).not.toBeInTheDocument();
    loadProbe(screen.getByTestId("domain-icon-probe"), 32, 32);
    expect(screen.getByTestId("domain-icon")).toHaveStyle({
      backgroundImage: 'url("https://icons.example.com/second.png")',
    });
  });

  it("accepts a real 32px favicon that the old exact-64 rule rejected", () => {
    render(<DomainIconLayer src="https://icons.example.com/favicon.png" testId="domain-icon" />);
    loadProbe(screen.getByTestId("domain-icon-probe"), 32, 32);
    expect(screen.getByTestId("domain-icon")).toHaveStyle({
      backgroundImage: 'url("https://icons.example.com/favicon.png")',
    });
  });

  it("paints an opaque layer surface so transparent favicon pixels never bleed through", () => {
    render(<DomainIconLayer src="https://icons.example.com/favicon.png" testId="domain-icon" />);
    loadProbe(screen.getByTestId("domain-icon-probe"), 32, 32);
    expect(screen.getByTestId("domain-icon")).toHaveStyle({
      backgroundColor: "var(--bg-sunken)",
      backgroundImage: 'url("https://icons.example.com/favicon.png")',
      backgroundPosition: "center",
      backgroundSize: "cover",
    });
  });

  it("rejects a 16px generic placeholder", () => {
    render(<DomainIconLayer src="https://icons.example.com/favicon.png" testId="domain-icon" />);
    loadProbe(screen.getByTestId("domain-icon-probe"), 16, 16);
    expect(screen.queryByTestId("domain-icon")).not.toBeInTheDocument();
  });

  it("rejects a non-square image", () => {
    render(<DomainIconLayer src="https://icons.example.com/favicon.png" testId="domain-icon" />);
    loadProbe(screen.getByTestId("domain-icon-probe"), 32, 16);
    expect(screen.queryByTestId("domain-icon")).not.toBeInTheDocument();
  });

  it("reveals the verified layer with an opacity-only starting-style transition", () => {
    render(<DomainIconLayer src="https://icons.example.com/favicon.png" testId="domain-icon" />);
    loadProbe(screen.getByTestId("domain-icon-probe"), 32, 32);

    const layer = screen.getByTestId("domain-icon");
    expect(layer).toHaveClass(
      "opacity-100",
      "starting:opacity-0",
      "transition-opacity",
      "duration-[var(--motion-tooltip)]",
      "ease-[ease]",
      "motion-reduce:transition-none",
    );
    expect(layer.className).toContain("opacity-100");
    expect(layer.className).not.toMatch(/scale|translate|rotate|animate-|delay-/);
    expect(layer.className).not.toMatch(/transition-(?!opacity|none)/);
  });

  it("preserves the painted DOM node across a repeated successful load for the same source", () => {
    render(<DomainIconLayer src="https://icons.example.com/favicon.png" testId="domain-icon" />);
    loadProbe(screen.getByTestId("domain-icon-probe"), 32, 32);
    const first = screen.getByTestId("domain-icon");

    loadProbe(screen.getByTestId("domain-icon-probe"), 32, 32);
    const second = screen.getByTestId("domain-icon");

    expect(second).toBe(first);
    expect(second.className).toBe(first.className);
  });

  it("paints the layer when a hydrated probe is already complete without a load event", async () => {
    const names = ["complete", "naturalWidth", "naturalHeight"] as const;
    const saved = names.map(
      (name) => [name, Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, name)] as const,
    );
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 32,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
      configurable: true,
      get: () => 32,
    });

    const container = document.createElement("div");
    document.body.append(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;

    try {
      container.innerHTML = renderToString(
        <DomainIconLayer src="https://icons.example.com/favicon.png" testId="domain-icon" />,
      );

      expect(container.querySelector('[data-testid="domain-icon-probe"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="domain-icon"]')).toBeNull();

      root = hydrateRoot(
        container,
        <DomainIconLayer src="https://icons.example.com/favicon.png" testId="domain-icon" />,
      );

      await act(async () => undefined);

      expect(container.querySelector('[data-testid="domain-icon"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="domain-icon"]')).toHaveStyle({
        backgroundImage: 'url("https://icons.example.com/favicon.png")',
      });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      if (root) {
        const r = root;
        await act(async () => r.unmount());
      }
      container.remove();
      consoleError.mockRestore();
      for (const [name, desc] of saved) {
        if (desc) {
          Object.defineProperty(HTMLImageElement.prototype, name, desc);
        } else {
          delete (HTMLImageElement.prototype as unknown as Record<string, unknown>)[name];
        }
      }
    }
  });
});
