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
});
