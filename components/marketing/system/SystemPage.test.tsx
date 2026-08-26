import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SystemLoadingPage, TerminalBlock } from "./SystemPage";

function getTerminalChrome(container: HTMLElement) {
  const dots = Array.from(container.querySelectorAll(".bg-red, .bg-yellow, .bg-green"));
  const header = dots[0]?.parentElement;

  expect(dots).toHaveLength(3);
  expect(header).toBeTruthy();

  return { header, terminal: header?.parentElement };
}

function expectDarkHairline(container: HTMLElement) {
  const { header, terminal } = getTerminalChrome(container);

  expect(terminal).toHaveClass("border", "border-code-border");
  expect(terminal).not.toHaveClass("border-border", "border-code-faint");
  expect(header).toHaveClass("border-b", "border-code-border", "bg-code-bg");
  expect(header).not.toHaveClass("border-code-faint");
}

describe("system terminal chrome", () => {
  it("uses the dark code-surface hairline when loaded", () => {
    const { container } = render(
      <TerminalBlock note="Not found" path="/missing" routes={["/docs"]} status="404" />,
    );

    expectDarkHairline(container);
  });

  it("keeps the loading terminal border treatment in parity", () => {
    const { container } = render(<SystemLoadingPage />);

    expectDarkHairline(container);
  });
});
