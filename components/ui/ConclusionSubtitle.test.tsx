import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConclusionSubtitle } from "./ConclusionSubtitle";

describe("ConclusionSubtitle", () => {
  it("reserves two lines and lets generated conclusions wrap", () => {
    render(<ConclusionSubtitle text="Avg position held steady over the last 30 days" />);

    expect(screen.getByText("Avg position held steady over the last 30 days")).toHaveClass(
      "line-clamp-2",
      "min-h-[39px]",
      "mt-2",
      "whitespace-normal",
      "text-[13px]",
      "text-fg-muted",
    );
  });

  it("collapses when empty and exposes a 60 percent loading skeleton", () => {
    const { container, rerender } = render(<ConclusionSubtitle />);
    expect(container).toBeEmptyDOMElement();

    rerender(<ConclusionSubtitle loading />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass(
      "h-[13px]",
      "w-3/5",
      "animate-pulse",
      "motion-reduce:animate-none",
    );
  });
});
