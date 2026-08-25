import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OnboardingCostSummary } from "./OnboardingCostSummary";

describe("OnboardingCostSummary", () => {
  it("paints the database glyph with the primary solid token", () => {
    const { container } = render(<OnboardingCostSummary>Summary</OnboardingCostSummary>);

    const icon = container.querySelector("svg");
    expect(icon).toHaveClass("text-accent-solid");
    expect(icon).not.toHaveClass("text-accent-text");
  });
});
