import { useAnalyticsProviderSync } from "@/components/analytics/use-analytics-provider-sync";
import { setNavigationState } from "@/tests/next-navigation";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, "cookie", "get").mockReturnValue("");
    setNavigationState({ pathname: "/" });
  });

  it("does not renew consent on visits or route changes", () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue("bv_consent=v2.a1.r1.t1788552000");
    const write = vi.spyOn(document, "cookie", "set").mockImplementation(() => undefined);
    const rendered = render(<Harness userId="user-1" />);
    setNavigationState({ pathname: "/app/project/rank-tracker" });
    rendered.rerender(<Harness userId="user-1" />);
    expect(write).not.toHaveBeenCalled();
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
