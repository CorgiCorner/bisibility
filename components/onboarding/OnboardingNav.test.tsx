import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingNav } from "./OnboardingNav";

describe("OnboardingNav", () => {
  it("uses the same computed height for Back and Continue", () => {
    render(<OnboardingNav currentStep={3} onBack={vi.fn()} />);

    const back = screen.getByRole("button", { name: "Back" });
    const continueButton = screen.getByRole("button", { name: "Continue" });

    expect(getComputedStyle(back).minHeight).toBe(getComputedStyle(continueButton).minHeight);
  });
});
