import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SummaryStrip } from "./SummaryStrip";

describe("SummaryStrip", () => {
  it("uses the rendered sentence as the status accessible name", () => {
    const sentence = "12 of 48 keywords improved this week · biggest drop: react data grid (-2)";
    render(<SummaryStrip sentence={sentence} tone="improved" />);

    expect(screen.getByRole("status", { name: sentence })).toHaveClass(
      "rounded-lg",
      "bg-bg-sunken",
      "text-[13px]",
    );
    expect(screen.getByRole("status").querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("collapses without copy and renders the exact loading height", () => {
    const { container, rerender } = render(<SummaryStrip />);
    expect(container).toBeEmptyDOMElement();

    rerender(<SummaryStrip loading />);
    expect(container.firstChild).toHaveClass("h-[34px]", "w-full");
  });
});
