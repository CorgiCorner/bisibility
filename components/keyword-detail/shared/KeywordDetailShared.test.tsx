import { KeywordDetailCheckSplitButton } from "@/components/keyword-detail/shared/KeywordDetailCheckSplitButton";
import { KeywordDetailContextPills } from "@/components/keyword-detail/shared/KeywordDetailContextPills";
import { KeywordDetailFreeActionButton } from "@/components/keyword-detail/shared/KeywordDetailFreeActionButton";
import { KeywordDetailPageSkeleton } from "@/components/keyword-detail/shared/KeywordDetailPageSkeleton";
import {
  KeywordDetailStatePill,
  keywordDetailPageStates,
} from "@/components/keyword-detail/shared/KeywordDetailStatePill";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { StepDots } from "@/components/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const depthOptions = [
  { label: "Top 10", price: "Provider estimate", value: "10" },
  { label: "Top 20", price: "Provider estimate", value: "20" },
  { label: "Top 50", price: "Provider estimate", value: "50" },
  { label: "Top 100", price: "Provider estimate", value: "100" },
] as const;

function stepDotClass(container: HTMLElement, state: "current" | "past" | "upcoming"): string {
  const dot = container.querySelector<HTMLElement>(`[data-step-dot-state="${state}"]`);

  expect(dot).not.toBeNull();
  return dot?.className ?? "";
}

describe("keyword detail shared primitives", () => {
  it("renders every page state as a named pill", () => {
    const { rerender } = render(<KeywordDetailStatePill state="ranked" />);

    expect(screen.getByText("Ranked")).toBeVisible();
    expect(keywordDetailPageStates).toEqual([
      "ranked",
      "never_checked",
      "not_ranked",
      "failed",
      "running",
    ]);

    rerender(<KeywordDetailStatePill state="failed" />);
    expect(screen.getByText("Check failed")).toBeVisible();
  });

  it("renders one location, device, and tracked depth", () => {
    render(<KeywordDetailContextPills depth={20} device="Desktop" location="United States" />);

    const context = screen.getByLabelText("Keyword context");
    expect(context).toHaveTextContent("United States");
    expect(context).toHaveTextContent("Desktop");
    expect(context).toHaveTextContent("Top 20");
  });

  it("selects an injected depth and keeps check execution separate", () => {
    const onAction = vi.fn();
    const onDepthChange = vi.fn();
    render(
      <KeywordDetailCheckSplitButton
        actionLabel="Run check"
        onAction={onAction}
        onDepthChange={onDepthChange}
        options={depthOptions}
        selectedValue="20"
        trackingDepthLabel="Top 20"
      />,
    );

    const caret = screen.getByRole("button", { name: "Choose check depth" });
    expect(caret).toHaveAttribute("aria-haspopup", "menu");
    expect(caret).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(caret);
    expect(screen.getAllByText("Provider estimate")).toHaveLength(4);
    fireEvent.click(screen.getByRole("menuitem", { name: /Top 50/ }));

    expect(onDepthChange).toHaveBeenCalledWith("50");
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the one-time tracking note and free refresh action explicit", () => {
    const onClick = vi.fn();
    render(
      <>
        <KeywordDetailCheckSplitButton
          actionLabel="Run check"
          onAction={() => undefined}
          onDepthChange={() => undefined}
          options={depthOptions}
          selectedValue="20"
          trackingDepthLabel="Top 20"
        />
        <KeywordDetailFreeActionButton onClick={onClick}>Refresh</KeywordDetailFreeActionButton>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose check depth" }));
    expect(screen.getByText("One-time check - tracking stays at Top 20.")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("marks the page loading region busy and hides every skeleton bar", () => {
    const { container } = render(<KeywordDetailPageSkeleton />);

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
    expect(overviewUpcomingClass).toContain("border-border-strong");
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

    const onboarding = render(
      <OnboardingStepper currentStep={2} flowState={{ projectId: "prj_1" }} maxReachableStep={2}>
        <div>Current panel</div>
      </OnboardingStepper>,
    );

    expect(screen.getByText("Step 2 of 4")).toBeVisible();
    expect(screen.getByLabelText("Onboarding steps")).toBeVisible();
    expect(stepDotClass(onboarding.container, "past")).toContain("bg-green");
    expect(stepDotClass(onboarding.container, "current")).toContain("bg-accent-solid");
    expect(stepDotClass(onboarding.container, "upcoming")).toContain("border-border");
    expect(stepDotClass(onboarding.container, "upcoming")).toContain("bg-bg-sunken");
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

    expect(keywordDetailPastClass).toContain("border-border-strong");
    expect(keywordDetailPastClass).toContain("border-[1.5px]");
    expect(keywordDetailCurrentClass).toContain("bg-accent-solid");
    expect(keywordDetailUpcomingClass).toContain("border-border-strong");
    expect(keywordDetailPastClass).toBe(keywordDetailUpcomingClass);
    expect(keywordDetailCurrentClass).not.toBe(keywordDetailPastClass);
    expect(keywordDetailCurrentClass).toBe(
      "h-1.5 w-1.5 rounded-full bg-accent-solid text-primary-contrast",
    );
    expect(keywordDetailPastClass).toBe(
      "h-1.5 w-1.5 rounded-full border-[1.5px] border-border-strong bg-transparent text-fg-muted",
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
