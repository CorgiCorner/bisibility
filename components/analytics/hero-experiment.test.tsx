import { OnboardingEntryAnalytics } from "@/components/analytics/OnboardingEntryAnalytics";
import { useHeroExperiment } from "@/components/analytics/use-hero-experiment";
import { track } from "@/lib/analytics/client";
import {
  HERO_EXPERIMENT_FLAG,
  HERO_EXPERIMENT_PROPERTY,
  syncHeroExperiment,
} from "@/lib/analytics/hero-experiment";
import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
function HeroHarness() {
  const { variant, exposureRef } = useHeroExperiment();
  return <section ref={exposureRef}>{variant}</section>;
}

describe("hero experiment measurement", () => {
  beforeEach(() => {
    syncHeroExperiment(false, undefined);
    vi.mocked(track).mockClear();
  });

  it.each([undefined, false, true, "unknown"])(
    "keeps B without enrolling missing or invalid flags (%s)",
    (flag) => {
      syncHeroExperiment(true, flag);
      render(<HeroHarness />);
      expect(screen.getByText("control")).toBeInTheDocument();
      expect(track).not.toHaveBeenCalled();
    },
  );

  it("waits for consent and a resolved flag, and records the displayed variant once", () => {
    syncHeroExperiment(false, "dual_cta");
    const view = render(
      <StrictMode>
        <HeroHarness />
      </StrictMode>,
    );
    expect(track).not.toHaveBeenCalled();
    act(() => syncHeroExperiment(true, "dual_cta"));
    expect(screen.getByText("dual_cta")).toBeInTheDocument();
    expect(track).toHaveBeenCalledExactlyOnceWith("landing_hero_viewed", {
      experiment: HERO_EXPERIMENT_FLAG,
      [HERO_EXPERIMENT_PROPERTY]: "dual_cta",
    });
    view.rerender(
      <StrictMode>
        <HeroHarness />
      </StrictMode>,
    );
    act(() => syncHeroExperiment(true, "dual_cta"));
    expect(track).toHaveBeenCalledOnce();
  });

  it("removes the treatment on consent withdrawal without recording a control exposure", () => {
    syncHeroExperiment(true, "dual_cta");
    render(<HeroHarness />);
    vi.mocked(track).mockClear();
    act(() => syncHeroExperiment(false, "control"));
    expect(screen.getByText("control")).toBeInTheDocument();
    expect(track).not.toHaveBeenCalled();
  });

  it("records B only when it is an actual experiment assignment", () => {
    syncHeroExperiment(true, "control");
    render(
      <StrictMode>
        <HeroHarness />
      </StrictMode>,
    );
    expect(track).toHaveBeenCalledExactlyOnceWith("landing_hero_viewed", {
      experiment: HERO_EXPERIMENT_FLAG,
      [HERO_EXPERIMENT_PROPERTY]: "control",
    });
  });

  it("records conversion only when onboarding mounts with analytics consent", () => {
    syncHeroExperiment(true, "dual_cta");
    const view = render(<HeroHarness />);
    expect(track).not.toHaveBeenCalledWith("onboarding_entered", expect.anything());
    view.rerender(
      <StrictMode>
        <OnboardingEntryAnalytics />
      </StrictMode>,
    );
    expect(track).toHaveBeenCalledWith("onboarding_entered", {});
    expect(
      vi.mocked(track).mock.calls.filter(([event]) => event === "onboarding_entered"),
    ).toHaveLength(1);
    view.rerender(
      <StrictMode>
        <OnboardingEntryAnalytics />
      </StrictMode>,
    );
    expect(
      vi.mocked(track).mock.calls.filter(([event]) => event === "onboarding_entered"),
    ).toHaveLength(1);
  });

  it("can start measuring on the onboarding page after consent is granted", () => {
    render(<OnboardingEntryAnalytics />);
    expect(track).not.toHaveBeenCalled();
    act(() => syncHeroExperiment(true, undefined));
    expect(track).toHaveBeenCalledExactlyOnceWith("onboarding_entered", {});
  });
});
