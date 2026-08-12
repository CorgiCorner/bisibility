import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingNav } from "./OnboardingNav";
import { OnboardingStepper } from "./OnboardingStepper";
import type { OnboardingStepNumber } from "./onboarding-fixtures";

describe("OnboardingStepper", () => {
  it("keeps reached rail steps clickable and future steps disabled", () => {
    render(
      <OnboardingStepper currentStep={2} flowState={{ projectId: "prj_1" }} maxReachableStep={3}>
        <div>Current panel</div>
      </OnboardingStepper>,
    );

    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    const rail = screen.getByLabelText("Onboarding steps");
    const links = within(rail).getAllByRole("link");

    expect(links).toHaveLength(3);
    expect(links.map((link) => link.textContent)).toEqual([
      "Create projectName and domainComplete",
      "2Connect dataRank checks and search insightsCurrent",
      "3Add keywordsKeywords and tracking defaultsNext",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/onboarding?step=1&projectId=prj_1",
      "/onboarding?step=2&projectId=prj_1",
      "/onboarding?step=3&projectId=prj_1",
    ]);
    expect(screen.getAllByRole("link", { name: "Create project, completed" })).toHaveLength(2);

    expect(rail.querySelector('[aria-label="First check"]')).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(rail.querySelector('[aria-label="First check"]')).toHaveTextContent(
      "Complete the previous step",
    );
    expect(
      rail.querySelector('[aria-label="First check"] [data-step-dot-state]'),
    ).toHaveTextContent("4");
  });

  it("disables future step buttons and keeps completed steps clickable", () => {
    const onStepChange = vi.fn();
    render(
      <OnboardingStepper currentStep={3} maxReachableStep={3} onStepChange={onStepChange}>
        <div>Current panel</div>
      </OnboardingStepper>,
    );

    const rail = screen.getByLabelText("Onboarding steps");
    const doneStep = within(rail).getByRole("button", { name: "Create project, completed" });
    expect(doneStep).not.toHaveAttribute("aria-current");
    fireEvent.click(doneStep);
    fireEvent.click(within(rail).getByRole("button", { name: "Connect data, completed" }));

    const futureRailButton = within(rail).getByRole("button", { name: "First check" });
    expect(futureRailButton).toHaveAccessibleName("First check");
    expect(futureRailButton).toHaveClass("MuiButton-root");
    expect(futureRailButton).toBeDisabled();
    expect(futureRailButton).toHaveAttribute("aria-disabled", "true");
    expect(futureRailButton.querySelector('[data-step-dot-state="upcoming"]')).toHaveTextContent(
      "4",
    );
    fireEvent.click(futureRailButton);

    for (const dot of screen.getAllByRole("button", { name: "First check" })) {
      expect(dot).toBeDisabled();
      expect(dot).toHaveAttribute("aria-disabled", "true");
    }
    expect(onStepChange).toHaveBeenCalledTimes(2);
    expect(onStepChange).toHaveBeenNthCalledWith(1, 1);
    expect(onStepChange).toHaveBeenNthCalledWith(2, 2);
  });

  it("renders back navigation across the four-step flow", () => {
    for (const step of [2, 3, 4] satisfies OnboardingStepNumber[]) {
      const { unmount } = render(
        <OnboardingNav currentStep={step} flowState={{ projectId: "prj_1" }} />,
      );

      expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
        "href",
        `/onboarding?step=${step - 1}&projectId=prj_1`,
      );
      unmount();
    }

    render(<OnboardingNav currentStep={4} />);

    expect(screen.getByRole("button", { name: /Open dashboard/ })).toBeInTheDocument();
  });
});
