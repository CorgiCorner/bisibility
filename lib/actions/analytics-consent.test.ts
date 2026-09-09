import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieStore: { set: vi.fn() },
  trackServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("@/lib/analytics/server", () => ({ trackServerEvent: mocks.trackServerEvent }));

import { saveAnalyticsConsent } from "@/lib/actions/analytics-consent";

describe("saveAnalyticsConsent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_788_552_000_000);
  });

  it("stores a valid choice and emits an anonymous update", async () => {
    await expect(saveAnalyticsConsent({ analytics: true, replay: false })).resolves.toEqual({
      analytics: true,
      decidedAt: 1_788_552_000,
      replay: false,
      status: "decided",
    });
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      "bv_consent",
      "v2.a1.r0.t1788552000",
      expect.objectContaining({ httpOnly: false, maxAge: 15_552_000, path: "/", sameSite: "lax" }),
    );
    expect(mocks.trackServerEvent).toHaveBeenCalledWith("consent_updated", {
      consent: expect.objectContaining({ analytics: true, replay: false, status: "decided" }),
      properties: { analytics: true, replay: false, version: 2 },
    });
  });

  it("stores replay independently without enabling analytics", async () => {
    await expect(saveAnalyticsConsent({ analytics: false, replay: true })).resolves.toEqual({
      analytics: false,
      decidedAt: 1_788_552_000,
      replay: true,
      status: "decided",
    });
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      "bv_consent",
      "v2.a0.r1.t1788552000",
      expect.objectContaining({ httpOnly: false, maxAge: 15_552_000, path: "/", sameSite: "lax" }),
    );
    expect(mocks.trackServerEvent).toHaveBeenCalledWith("consent_updated", {
      consent: expect.objectContaining({ analytics: false, replay: true, status: "decided" }),
      properties: { analytics: false, replay: true, version: 2 },
    });
  });

  it("rejects invalid purpose values before writing", async () => {
    await expect(saveAnalyticsConsent({ analytics: false, replay: "yes" })).rejects.toThrow();
    expect(mocks.cookieStore.set).not.toHaveBeenCalled();
    expect(mocks.trackServerEvent).not.toHaveBeenCalled();
  });
});
