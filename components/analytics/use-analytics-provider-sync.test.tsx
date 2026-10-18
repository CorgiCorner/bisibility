import { useAnalyticsProviderSync } from "@/components/analytics/use-analytics-provider-sync";
import { setNavigationState } from "@/tests/next-navigation";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: {
    ready: true,
    rechecking: false,
    consent: undefined as import("@/lib/analytics/consent").ConsentState | undefined,
  },
  applyAnalyticsConsent: vi.fn(),
  pauseAnalyticsConsent: vi.fn(),
  setAnalyticsConsentScope: vi.fn(),
  identifyAnalyticsUser: vi.fn(),
  resetAnalyticsIdentity: vi.fn(),
  setAnalyticsReplay: vi.fn(),
}));

vi.mock("@/lib/analytics/client", () => ({
  applyAnalyticsConsent: mocks.applyAnalyticsConsent,
  pauseAnalyticsConsent: mocks.pauseAnalyticsConsent,
  setAnalyticsConsentScope: mocks.setAnalyticsConsentScope,
  identifyAnalyticsUser: mocks.identifyAnalyticsUser,
  resetAnalyticsIdentity: mocks.resetAnalyticsIdentity,
  setAnalyticsReplay: mocks.setAnalyticsReplay,
}));
vi.mock("./use-account-consent-sync", () => ({ useAccountConsentSync: () => mocks.account }));

const consent = { analytics: true, decidedAt: 1, replay: true, status: "decided" as const };

function Harness({ userId }: Readonly<{ userId?: string }>) {
  useAnalyticsProviderSync({ consent, provider: "posthog", userId });
  return null;
}

describe("useAnalyticsProviderSync", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = { ready: true, rechecking: false, consent: undefined };
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

  it("keeps account analytics off when replay retains an old accepted browser cookie", () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue("bv_consent=v2.a1.r1.t1788552000");
    mocks.account.consent = { ...consent, analytics: false, analyticsNeedsDecision: true };
    render(<Harness userId="usr_current" />);
    expect(mocks.applyAnalyticsConsent).toHaveBeenLastCalledWith(
      expect.objectContaining({ analytics: false, replay: true }),
    );
    expect(mocks.identifyAnalyticsUser).not.toHaveBeenCalled();
    expect(mocks.setAnalyticsReplay).toHaveBeenLastCalledWith(true);
  });
  it("pauses a same-account route recheck and still resets on a resolved refusal", () => {
    const rendered = render(<Harness userId="usr_current" />);
    vi.clearAllMocks();
    mocks.account.ready = false;
    mocks.account.rechecking = true;
    setNavigationState({ pathname: "/app/project/dashboard" });
    rendered.rerender(<Harness userId="usr_current" />);
    expect(mocks.pauseAnalyticsConsent).toHaveBeenCalledWith(
      expect.objectContaining({ analytics: false, replay: true }),
    );
    expect(mocks.applyAnalyticsConsent).not.toHaveBeenCalled();
    expect(mocks.resetAnalyticsIdentity).not.toHaveBeenCalled();
    expect(mocks.setAnalyticsReplay).toHaveBeenLastCalledWith(true);
    mocks.account = { ready: true, rechecking: false, consent: { ...consent, analytics: false } };
    rendered.rerender(<Harness userId="usr_current" />);
    expect(mocks.applyAnalyticsConsent).toHaveBeenLastCalledWith(
      expect.objectContaining({ analytics: false }),
    );
    expect(mocks.resetAnalyticsIdentity).toHaveBeenCalledOnce();
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
