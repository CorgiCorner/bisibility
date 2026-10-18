import { type ConsentState, pendingConsent } from "@/lib/analytics/consent";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sync: vi.fn(), readAccount: vi.fn(), seedAccount: vi.fn() }));
vi.mock("@/lib/actions/analytics-consent", () => ({ syncAccountAnalyticsConsent: mocks.sync }));

vi.mock("@/lib/analytics/account-consent", async (original) => ({
  ...(await original<typeof import("@/lib/analytics/account-consent")>()),
  readAccountAnalyticsConsent: mocks.readAccount,
  seedAccountAnalyticsConsent: mocks.seedAccount,
}));

import { applyAnalyticsConsent, readAppliedAnalyticsConsent } from "@/lib/analytics/client";
import { readBrowserConsent, restrictConsentImmediately } from "@/lib/analytics/consent-client";
import { reconcileWebConsent } from "@/lib/analytics/web-consent";
import { useAccountConsentSync } from "./use-account-consent-sync";

const accepted: ConsentState = {
  analytics: true,
  replay: false,
  decidedAt: 1788552000,
  status: "decided",
};
describe("account consent synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, "cookie", "get").mockReturnValue("");
  });
  afterEach(() => vi.restoreAllMocks());
  it("keeps analytics unavailable until the account choice has loaded", async () => {
    let finish!: (consent: ConsentState) => void;
    mocks.sync.mockReturnValue(
      new Promise<ConsentState>((resolve) => {
        finish = resolve;
      }),
    );
    const hook = renderHook(() => useAccountConsentSync("posthog", "usr_example"));
    expect(hook.result.current.ready).toBe(false);
    await act(async () => finish(accepted));
    expect(hook.result.current).toEqual({ ready: true, consent: accepted });
    expect(mocks.sync).toHaveBeenCalledWith("usr_example");
  });
  it("retains pending state without turning it into acceptance", async () => {
    mocks.sync.mockResolvedValue(pendingConsent());
    const write = vi.spyOn(document, "cookie", "set").mockImplementation(() => undefined);
    const hook = renderHook(() => useAccountConsentSync("posthog", "usr_example"));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.consent?.analytics).toBe(false);
    expect(write.mock.calls.some(([value]) => value.startsWith("bv_consent="))).toBe(false);
  });
  it("does not overwrite a newer browser decision while a sync is in flight", async () => {
    let finish!: (consent: ConsentState) => void;
    mocks.sync.mockReturnValue(
      new Promise<ConsentState>((resolve) => {
        finish = resolve;
      }),
    );
    const cookie = vi.spyOn(document, "cookie", "get").mockReturnValue("");
    const write = vi.spyOn(document, "cookie", "set").mockImplementation(() => undefined);
    renderHook(() => useAccountConsentSync("posthog", "usr_example"));
    cookie.mockReturnValue("bv_consent=v2.a0.r0.t1788552000");
    await act(async () => finish(accepted));
    expect(write).not.toHaveBeenCalled();
  });

  it("preserves a new refusal even when its cookie is byte-for-byte identical", async () => {
    let finish!: (consent: ConsentState) => void;
    mocks.sync.mockReturnValue(
      new Promise<ConsentState>((resolve) => {
        finish = resolve;
      }),
    );
    vi.spyOn(document, "cookie", "get").mockReturnValue("bv_consent=v2.a0.r0.t1788552000");
    const write = vi.spyOn(document, "cookie", "set").mockImplementation(() => undefined);
    renderHook(() => useAccountConsentSync("posthog", "usr_example"));
    restrictConsentImmediately({ analytics: false, replay: false });
    write.mockClear();
    await act(async () => finish(accepted));
    expect(write).not.toHaveBeenCalled();
  });
  it("ignores an old account response after identity changes", async () => {
    let finish!: (consent: ConsentState) => void;
    mocks.sync
      .mockReturnValueOnce(
        new Promise<ConsentState>((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce(pendingConsent());
    const hook = renderHook(({ user }) => useAccountConsentSync("posthog", user), {
      initialProps: { user: "usr_first" },
    });
    hook.rerender({ user: "usr_second" });
    await waitFor(() => expect(hook.result.current.consent?.analytics).toBe(false));
    await act(async () => finish(accepted));
    expect(hook.result.current.consent?.analytics).toBe(false);
  });
  it("does not query the account store for a provider without hosted analytics", () => {
    renderHook(() => useAccountConsentSync("none", "usr_example"));
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("does not treat an unavailable authenticated identity as an anonymous visitor", () => {
    const hook = renderHook(() => useAccountConsentSync("posthog", undefined, true));
    expect(hook.result.current.ready).toBe(false);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("keeps independent replay storage while requesting a new account analytics decision", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue("bv_consent=v2.a1.r1.t1788552000");
    const write = vi.spyOn(document, "cookie", "set").mockImplementation(() => undefined);
    mocks.sync.mockResolvedValue({
      ...accepted,
      analytics: false,
      replay: true,
      analyticsNeedsDecision: true,
    });
    const hook = renderHook(() => useAccountConsentSync("posthog", "usr_example"));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.consent?.analyticsNeedsDecision).toBe(true);
    expect(write.mock.calls.some(([value]) => value.startsWith("bv_consent=v3.a0.r1.t"))).toBe(
      true,
    );
  });
  it("re-reads account permission after navigation and pauses capture until it resolves", async () => {
    mocks.sync.mockResolvedValueOnce(accepted);
    const hook = renderHook(
      ({ route }) => useAccountConsentSync("posthog", "usr_example", true, route),
      { initialProps: { route: "/first" } },
    );
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    let finish!: (consent: ConsentState) => void;
    mocks.sync.mockReturnValueOnce(
      new Promise<ConsentState>((resolve) => {
        finish = resolve;
      }),
    );
    hook.rerender({ route: "/second" });
    expect(hook.result.current.ready).toBe(false);
    expect(hook.result.current).toMatchObject({ rechecking: true });
    await act(async () => finish(pendingConsent()));
    expect(hook.result.current.consent?.analytics).toBe(false);
  });
  it("does not pause an account switch using the previous account grant", async () => {
    mocks.sync.mockResolvedValueOnce(accepted).mockReturnValueOnce(new Promise(() => {}));
    const hook = renderHook(({ user }) => useAccountConsentSync("posthog", user, true, "/same"), {
      initialProps: { user: "usr_first" },
    });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    hook.rerender({ user: "usr_second" });
    expect(hook.result.current.ready).toBe(false);
    expect(hook.result.current.consent).toBeUndefined();
    expect(hook.result.current).not.toHaveProperty("rechecking");
  });

  it("does not let a resolved account snapshot undo a later explicit browser choice", async () => {
    mocks.sync.mockResolvedValueOnce({ ...accepted, analytics: false });
    const hook = renderHook(() => useAccountConsentSync("posthog", "usr_example"));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    restrictConsentImmediately({ analytics: false, replay: false });
    hook.rerender();
    expect(hook.result.current.consent).toBeUndefined();
  });
  it("never grants from a foreign accepted cookie before the server save succeeds", () => {
    const original = Math.floor(Date.now() / 1000) - 300;
    let cookie = `bv_consent=v2.a1.r1.t${original}`;
    vi.spyOn(document, "cookie", "get").mockImplementation(() => cookie);
    vi.spyOn(document, "cookie", "set").mockImplementation((value) => {
      cookie = value.includes("Max-Age=0") ? "" : value.split(";")[0];
    });
    applyAnalyticsConsent({
      analytics: false,
      replay: true,
      decidedAt: original,
      status: "decided",
      analyticsNeedsDecision: true,
    });
    restrictConsentImmediately({ analytics: true, replay: true });
    const restricted = readBrowserConsent(pendingConsent());
    expect(restricted).toMatchObject({
      analytics: false,
      analyticsNeedsDecision: true,
      replay: true,
      decidedAt: original,
    });
    expect(readAppliedAnalyticsConsent()?.analytics).toBe(false);
  });
  it.each([false, true])(
    "does not seed a synthetic refusal after failed Accept and navigation (replay=%s)",
    async (replay) => {
      const original = Math.floor(Date.now() / 1000) - 300;
      let cookie = replay ? `bv_consent=v3.a0.r1.t${original}` : "";
      vi.spyOn(document, "cookie", "get").mockImplementation(() => cookie);
      vi.spyOn(document, "cookie", "set").mockImplementation((value) => {
        cookie = value.includes("Max-Age=0") ? "" : value.split(";")[0];
      });
      applyAnalyticsConsent(
        replay
          ? {
              analytics: false,
              analyticsNeedsDecision: true,
              replay: true,
              decidedAt: original,
              status: "decided",
            }
          : pendingConsent(),
      );
      restrictConsentImmediately({ analytics: true, replay: true });
      // A rejected save performs no successful completion callback before navigation.
      mocks.readAccount.mockResolvedValue({
        analytics: false,
        decided_at: null,
        source: null,
        version: 2,
      });
      mocks.seedAccount.mockResolvedValue({
        analytics: false,
        decided_at: new Date().toISOString(),
        source: "web",
        version: 2,
      });
      const synced = await reconcileWebConsent("internal", readBrowserConsent(pendingConsent()));
      expect(synced.analytics).toBe(false);
      expect(synced.analyticsNeedsDecision).toBe(true);
      expect(mocks.seedAccount).not.toHaveBeenCalled();
      expect(readAppliedAnalyticsConsent()?.analytics).toBe(false);
    },
  );
  it("does not rewrite an unchanged browser choice", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue("bv_consent=v2.a1.r0.t1788552000");
    const write = vi.spyOn(document, "cookie", "set").mockImplementation(() => undefined);
    mocks.sync.mockResolvedValue(accepted);
    const hook = renderHook(() => useAccountConsentSync("posthog", "usr_example"));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(write.mock.calls.some(([value]) => value.startsWith("bv_consent="))).toBe(false);
  });
});
