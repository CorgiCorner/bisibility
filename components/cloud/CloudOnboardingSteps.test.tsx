import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CloudOnboardingSteps } from "./CloudOnboardingSteps";

describe("CloudOnboardingSteps", () => {
  it.each([
    [1, "Account"],
    [2, "Start"],
    [3, "Finish"],
  ])("renders current step %s and all labels", (currentStep, currentLabel) => {
    const { container } = render(<CloudOnboardingSteps currentStep={currentStep} />);

    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("Finish")).toBeInTheDocument();
    expect(screen.getByText(currentLabel).className).toContain("font-semibold");
    expect(container.querySelectorAll("svg")).toHaveLength(currentStep - 1);
  });
});
