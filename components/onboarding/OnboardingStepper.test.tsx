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

    expect(screen.getByText("Step 2 of 6")).toBeInTheDocument();
    const rail = screen.getByLabelText("Onboarding steps");
    const links = within(rail).getAllByRole("link");

    expect(links).toHaveLength(3);
    expect(links.map((link) => link.textContent)).toEqual([
      "Create projectName, domain, what counts as yours",
      "Developer accessCLI sign-in or a project API key",
      "Connect dataYour SERP provider for rank tracking",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/onboarding?step=1&projectId=prj_1",
      "/onboarding?step=2&projectId=prj_1",
      "/onboarding?step=3&projectId=prj_1",
    ]);

    expect(rail.querySelector('[aria-label="Add keywords"]')).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(rail.querySelector('[aria-label="First check"]')).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("disables future step buttons and keeps completed steps clickable", () => {
    const onStepChange = vi.fn();
    render(
      <OnboardingStepper currentStep={3} maxReachableStep={3} onStepChange={onStepChange}>
        <div>Current panel</div>
      </OnboardingStepper>,
    );

    const rail = screen.getByLabelText("Onboarding steps");
    fireEvent.click(within(rail).getByRole("button", { name: "Create project" }));
    fireEvent.click(within(rail).getByRole("button", { name: "Connect data" }));

    const futureRailButton = within(rail).getByRole("button", { name: "Add keywords" });
    expect(futureRailButton).toBeDisabled();
    expect(futureRailButton).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(futureRailButton);

    for (const dot of screen.getAllByRole("button", { name: "Add keywords" })) {
      expect(dot).toBeDisabled();
      expect(dot).toHaveAttribute("aria-disabled", "true");
    }
    expect(onStepChange).toHaveBeenCalledTimes(2);
    expect(onStepChange).toHaveBeenNthCalledWith(1, 1);
    expect(onStepChange).toHaveBeenNthCalledWith(2, 3);
  });

  it("renders back navigation across the six-step flow", () => {
    for (const step of [2, 3, 4, 5, 6] satisfies OnboardingStepNumber[]) {
      const { unmount } = render(
        <OnboardingNav currentStep={step} flowState={{ projectId: "prj_1" }} />,
      );

      expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
        "href",
        `/onboarding?step=${step - 1}&projectId=prj_1`,
      );
      unmount();
    }

    render(<OnboardingNav currentStep={6} />);

    expect(screen.getByRole("button", { name: /Open dashboard/ })).toBeInTheDocument();
  });
});
