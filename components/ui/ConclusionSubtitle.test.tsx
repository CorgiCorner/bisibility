import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConclusionSubtitle } from "./ConclusionSubtitle";

describe("ConclusionSubtitle", () => {
  it("renders a single-line conclusion with the shared spacing and type treatment", () => {
    render(<ConclusionSubtitle text="Avg position held steady over the last 30 days" />);

    expect(screen.getByText("Avg position held steady over the last 30 days")).toHaveClass(
      "mb-3",
      "mt-2",
      "whitespace-nowrap",
      "text-[13px]",
      "text-fg-muted",
    );
  });

  it("collapses when empty and exposes a 60 percent loading skeleton", () => {
    const { container, rerender } = render(<ConclusionSubtitle />);
    expect(container).toBeEmptyDOMElement();

    rerender(<ConclusionSubtitle loading />);
    expect(container.firstChild).toHaveClass("h-[13px]", "w-3/5");
  });
});
