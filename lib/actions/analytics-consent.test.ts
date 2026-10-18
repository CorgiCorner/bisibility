import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieStore: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
  getSession: vi.fn(),
  saveAccount: vi.fn(),
  resolveUser: vi.fn(),
  reconcile: vi.fn(),
  trackServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("@/lib/analytics/server", () => ({ trackServerEvent: mocks.trackServerEvent }));
vi.mock("@/lib/auth/session", () => ({ getOptionalAvailableSession: mocks.getSession }));
vi.mock("@/lib/analytics/account-consent", () => ({
  saveAccountAnalyticsConsent: mocks.saveAccount,
}));
vi.mock("@/lib/analytics/server-user", () => ({ resolveServerAnalyticsUser: mocks.resolveUser }));
vi.mock("@/lib/analytics/web-consent", () => ({ reconcileWebConsent: mocks.reconcile }));

import { saveAnalyticsConsent, syncAccountAnalyticsConsent } from "@/lib/actions/analytics-consent";

describe("saveAnalyticsConsent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
    vi.spyOn(Date, "now").mockReturnValue(1_788_552_000_000);
  });

  it("writes the same signed-in decision to the account without coupling replay", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "internal" } });
    mocks.resolveUser.mockResolvedValue({ distinctId: "usr_a00000000000000000000000" });
    await saveAnalyticsConsent({ analytics: false, replay: true });
    expect(mocks.saveAccount).toHaveBeenCalledWith(
      "internal",
      false,
      "web",
      new Date(1_788_552_000_000),
      { authKind: "session" },
      true,
    );
  });

  it("does not seed a new account from a previous account's browser decision", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "internal" } });
    mocks.resolveUser.mockResolvedValue({ distinctId: "usr_current" });
    mocks.cookieStore.get.mockImplementation((name) => ({
      value: name === "bv_consent" ? "v2.a1.r1.t1788552000" : "usr_previous",
    }));
    await syncAccountAnalyticsConsent("usr_current");
    expect(mocks.reconcile).toHaveBeenCalledWith(
      "internal",
      expect.objectContaining({ analytics: false, replay: false, status: "pending" }),
    );
  });

  it("does not resolve a stale request after the signed-in account changes", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "internal" } });
    mocks.resolveUser.mockResolvedValue({ distinctId: "usr_current" });
    await expect(syncAccountAnalyticsConsent("usr_previous")).resolves.toMatchObject({
      analytics: false,
      status: "pending",
    });
    expect(mocks.reconcile).not.toHaveBeenCalled();
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

  it("remembers a full refusal for seven days", async () => {
    await saveAnalyticsConsent({ analytics: false, replay: false });
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      "bv_consent",
      "v2.a0.r0.t1788552000",
      expect.objectContaining({ maxAge: 604_800 }),
    );
  });

  it("records the prompt variant and decision timing without an identity or an exposure event", async () => {
    await saveAnalyticsConsent(
      { analytics: false, replay: false },
      { variant: "delayed_5s", source: "banner", decision_ms: 2100 },
    );
    expect(mocks.trackServerEvent).toHaveBeenCalledOnce();
    expect(mocks.trackServerEvent).toHaveBeenCalledWith("consent_updated", {
      consent: expect.objectContaining({ analytics: false, replay: false }),
      properties: {
        analytics: false,
        replay: false,
        version: 2,
        prompt_variant: "delayed_5s",
        decision_source: "banner",
        decision_ms: 2100,
      },
    });
  });
});
