import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewChartHeader } from "./OverviewChartHeader";

describe("OverviewChartHeader", () => {
  it("uses subtle sans typography for definition prose", () => {
    render(
      <OverviewChartHeader definition="Lower is better - #1 is the top." title="Position trend" />,
    );

    const definition = screen.getByText("Lower is better - #1 is the top.", {
      selector: "p",
    });

    expect(definition).toHaveClass(
      "mt-[3px]",
      "block",
      "min-h-[2lh]",
      "font-sans",
      "text-[11px]",
      "leading-normal",
      "text-fg-muted",
    );
    expect(definition).not.toHaveClass("font-mono");
  });
});
