import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
