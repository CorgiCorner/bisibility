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
    loadProbe(screen.getByTestId("domain-icon-probe"), 64, 64);
    expect(screen.getByTestId("domain-icon")).toHaveStyle({
      backgroundImage: 'url("https://icons.example.com/first.png")',
    });

    rerender(
      <DomainIconLayer size={64} src="https://icons.example.com/second.png" testId="domain-icon" />,
    );

    expect(screen.queryByTestId("domain-icon")).not.toBeInTheDocument();
    loadProbe(screen.getByTestId("domain-icon-probe"), 64, 64);
    expect(screen.getByTestId("domain-icon")).toHaveStyle({
      backgroundImage: 'url("https://icons.example.com/second.png")',
    });
  });
});
