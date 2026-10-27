import { KeywordDetailPageSkeleton } from "@/components/keyword-detail/shared/KeywordDetailPageSkeleton";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { StepDots } from "@/components/ui/StepDots";
import {
  renderWithProjectRankTrackerMessages as render,
  renderWithOnboardingMessages as renderOnboarding,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function stepDotClass(container: HTMLElement, state: "current" | "past" | "upcoming"): string {
  const dot = container.querySelector<HTMLElement>(`[data-step-dot-state="${state}"]`);

  expect(dot).not.toBeNull();
  return dot?.className ?? "";
}

describe("keyword detail shared primitives", () => {
  it("marks the page loading region busy and hides every skeleton bar", () => {
    const { container } = render(<KeywordDetailPageSkeleton ariaLabel="Loading keyword detail" />);

    expect(screen.getByRole("region", { name: "Loading keyword detail" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    for (const bar of container.querySelectorAll("[data-keyword-detail-skeleton-bar]")) {
      expect(bar).toHaveAttribute("aria-hidden", "true");
    }

    const contextPills = container.querySelector("[data-keyword-detail-skeleton-context-pills]");
    expect(contextPills?.querySelectorAll("[data-keyword-detail-skeleton-bar]")).toHaveLength(4);
    const headerMetadata = container.querySelector(
      "[data-keyword-detail-skeleton-header-metadata]",
    );
    expect(headerMetadata?.querySelectorAll("[data-keyword-detail-skeleton-bar]")).toHaveLength(5);
    expect(
      container.querySelectorAll("[data-keyword-detail-skeleton-ranking-history-row]"),
    ).toHaveLength(4);
  });

  it("keeps onboarding distinct and keyword detail flat for step-dot states", () => {
    const overview = render(
      <StepDots
        className="flex items-center gap-2.5"
        currentIndex={1}
        items={[1, 2, 3]}
        label={<span>Step 2 of 3</span>}
        variant="onboarding"
      />,
    );

    expect(screen.getByText("Step 2 of 3")).toBeVisible();
    expect(overview.container.querySelectorAll("[data-step-dot-state]")).toHaveLength(3);
    const overviewPastClass = stepDotClass(overview.container, "past");
    const overviewCurrentClass = stepDotClass(overview.container, "current");
    const overviewUpcomingClass = stepDotClass(overview.container, "upcoming");

    expect(overviewPastClass).toContain("bg-green");
    expect(overviewCurrentClass).toContain("bg-accent-solid");
    expect(overviewUpcomingClass).toContain("border-border");
    expect(new Set([overviewPastClass, overviewCurrentClass, overviewUpcomingClass])).toHaveLength(
      3,
    );
    for (const cls of [overviewPastClass, overviewCurrentClass, overviewUpcomingClass]) {
      expect(cls).toContain("transition-colors");
      expect(cls).toContain("duration-[var(--motion-tooltip)]");
      expect(cls).toContain("ease-[ease]");
      expect(cls).toContain("motion-reduce:transition-none");
      expect(cls).not.toMatch(/scale|translate|rotate|animate-|delay-/);
    }
    overview.unmount();

    const onboarding = renderOnboarding(
      <OnboardingStepper currentStep={2} flowState={{ projectId: "prj_1" }} maxReachableStep={2}>
        <div>Current panel</div>
      </OnboardingStepper>,
    );

    expect(screen.getByText("Step 2 of 4")).toBeVisible();
    expect(screen.getByLabelText("Onboarding steps")).toBeVisible();
    expect(stepDotClass(onboarding.container, "past")).toContain("bg-accent-soft");
    expect(stepDotClass(onboarding.container, "current")).toContain("bg-accent-solid");
    expect(stepDotClass(onboarding.container, "upcoming")).toContain("border-border");
    expect(stepDotClass(onboarding.container, "upcoming")).toContain("bg-transparent");
    onboarding.unmount();

    const keywordDetail = render(
      <StepDots
        className="flex items-center gap-2.5"
        currentIndex={1}
        items={[1, 2, 3]}
        label={<span>Keyword detail progress</span>}
        variant="keyword-detail"
      />,
    );

    const keywordDetailPastClass = stepDotClass(keywordDetail.container, "past");
    const keywordDetailCurrentClass = stepDotClass(keywordDetail.container, "current");
    const keywordDetailUpcomingClass = stepDotClass(keywordDetail.container, "upcoming");

    expect(keywordDetailPastClass).toContain("border-border");
    expect(keywordDetailPastClass).toContain("border-[1.5px]");
    expect(keywordDetailCurrentClass).toContain("bg-accent-solid");
    expect(keywordDetailUpcomingClass).toContain("border-border");
    expect(keywordDetailPastClass).toBe(keywordDetailUpcomingClass);
    expect(keywordDetailCurrentClass).not.toBe(keywordDetailPastClass);
    expect(keywordDetailCurrentClass).toBe(
      "h-1.5 w-1.5 rounded-full bg-accent-solid text-accent-on-solid",
    );
    expect(keywordDetailPastClass).toBe(
      "h-1.5 w-1.5 rounded-full border-[1.5px] border-border bg-transparent text-fg-muted",
    );
    for (const cls of [
      keywordDetailPastClass,
      keywordDetailCurrentClass,
      keywordDetailUpcomingClass,
    ]) {
      expect(cls).not.toMatch(/transition-/);
      expect(cls).not.toMatch(/scale|translate|rotate|animate-|delay-/);
    }
  });
});
