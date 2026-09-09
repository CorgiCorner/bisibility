import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  requiresConsent: false,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (mocks.cookieValue ? { value: mocks.cookieValue } : undefined),
  }),
}));
vi.mock("@/components/analytics/ConsentBanner", () => ({
  ConsentBanner: () => <div>Consent banner</div>,
}));
// Provider selection differs by deployment; the slot consumes its consent policy.
vi.mock("@/lib/analytics/provider", () => ({
  resolveAnalyticsProvider: vi.fn(() => "plausible"),
  providerRequiresConsent: vi.fn(() => mocks.requiresConsent),
}));

import { ConsentSlot } from "@/components/analytics/ConsentSlot";
import { providerRequiresConsent, resolveAnalyticsProvider } from "@/lib/analytics/provider";

describe("ConsentSlot", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.cookieValue = undefined;
    mocks.requiresConsent = false;
  });

  it("does not render without a consent-requiring provider", async () => {
    const slot = await ConsentSlot();
    expect(slot).toBeNull();
  });

  it("renders only while consent is pending", async () => {
    mocks.requiresConsent = true;
    render(await ConsentSlot());
    expect(screen.getByText("Consent banner")).toBeInTheDocument();
    expect(resolveAnalyticsProvider).toHaveBeenCalledWith(process.env);
    expect(providerRequiresConsent).toHaveBeenCalledWith("plausible");

    mocks.cookieValue = "v1.a1.r0.t1788552000";
    expect(await ConsentSlot()).toBeNull();
  });

  it("requests a new decision for legacy replay consent", async () => {
    mocks.requiresConsent = true;
    mocks.cookieValue = "v1.a1.r1.t1788552000";
    render(await ConsentSlot());
    expect(screen.getByText("Consent banner")).toBeInTheDocument();
  });
});
