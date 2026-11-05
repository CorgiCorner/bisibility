import { OnboardingEntryAnalytics } from "@/components/analytics/OnboardingEntryAnalytics";
import { track } from "@/lib/analytics/client";
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));

describe("onboarding entry analytics", () => {
  beforeEach(() => {
    vi.mocked(track).mockClear();
  });

  it("records onboarding_entered once when the page mounts", () => {
    const view = render(
      <StrictMode>
        <OnboardingEntryAnalytics />
      </StrictMode>,
    );
    expect(track).toHaveBeenCalledExactlyOnceWith("onboarding_entered", {});
    view.rerender(
      <StrictMode>
        <OnboardingEntryAnalytics />
      </StrictMode>,
    );
    expect(track).toHaveBeenCalledExactlyOnceWith("onboarding_entered", {});
  });
});
