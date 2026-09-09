import { useAnalyticsProviderSync } from "@/components/analytics/use-analytics-provider-sync";
import { setNavigationState } from "@/tests/next-navigation";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyAnalyticsConsent: vi.fn(),
  identifyAnalyticsUser: vi.fn(),
  resetAnalyticsIdentity: vi.fn(),
  setAnalyticsReplay: vi.fn(),
}));

vi.mock("@/lib/analytics/client", () => ({
  applyAnalyticsConsent: mocks.applyAnalyticsConsent,
  identifyAnalyticsUser: mocks.identifyAnalyticsUser,
  resetAnalyticsIdentity: mocks.resetAnalyticsIdentity,
  setAnalyticsReplay: mocks.setAnalyticsReplay,
}));

const consent = { analytics: true, decidedAt: 1, replay: true, status: "decided" as const };

function Harness({ userId }: Readonly<{ userId?: string }>) {
  useAnalyticsProviderSync({ consent, provider: "posthog", userId });
  return null;
}

describe("useAnalyticsProviderSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setNavigationState({ pathname: "/" });
  });

  it("synchronizes consent, route-scoped replay, and identity", () => {
    const rendered = render(<Harness userId="user-1" />);

    expect(mocks.applyAnalyticsConsent).toHaveBeenCalledWith(consent);
    expect(mocks.setAnalyticsReplay).toHaveBeenCalledWith(true);
    expect(mocks.identifyAnalyticsUser).toHaveBeenCalledWith("user-1");

    setNavigationState({ pathname: "/app/project/dashboard" });
    rendered.rerender(<Harness userId="user-1" />);
    expect(mocks.setAnalyticsReplay).toHaveBeenLastCalledWith(true);

    rendered.rerender(<Harness />);
    expect(mocks.resetAnalyticsIdentity).toHaveBeenCalled();
  });
});
