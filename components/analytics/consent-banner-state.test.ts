import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readConsent: vi.fn() }));
vi.mock("@/lib/analytics/consent-client", () => ({ readBrowserConsent: mocks.readConsent }));

import { pendingConsent } from "@/lib/analytics/consent";
import { MOTION_MODAL_EXIT } from "@/lib/ui/motion";
import { createConsentBannerState } from "./consent-banner-state";

describe("consent banner presentation clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.readConsent.mockReturnValue(pendingConsent());
  });
  afterEach(() => vi.useRealTimers());

  it("shows only after the full five-second delay", async () => {
    const store = createConsentBannerState(pendingConsent(), 5000);
    const unsubscribe = store.subscribe(vi.fn());
    expect(store.getSnapshot().phase).toBe("waiting");
    await vi.advanceTimersByTimeAsync(4999);
    expect(store.getSnapshot().phase).toBe("waiting");
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getSnapshot()).toEqual({ phase: "open", shownAt: Date.now() });
    unsubscribe();
  });

  it("respects a decision made through settings during the delay", async () => {
    const store = createConsentBannerState(pendingConsent(), 5000);
    const unsubscribe = store.subscribe(vi.fn());
    mocks.readConsent.mockReturnValue({
      analytics: false,
      replay: false,
      status: "decided",
      decidedAt: 1,
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.getSnapshot().phase).toBe("closed");
    unsubscribe();
  });

  it("cleans up unmounted timers and preserves the original deadline on resubscribe", async () => {
    const store = createConsentBannerState(pendingConsent(), 5000);
    const unsubscribe = store.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
    const next = store.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(4000);
    expect(store.getSnapshot().phase).toBe("open");
    next();
  });

  it("retains the closing card only for its exit duration", async () => {
    const store = createConsentBannerState(pendingConsent(), 0);
    const unsubscribe = store.subscribe(vi.fn());
    store.close();
    expect(store.getSnapshot().phase).toBe("closing");
    await vi.advanceTimersByTimeAsync(MOTION_MODAL_EXIT);
    expect(store.getSnapshot().phase).toBe("closed");
    unsubscribe();
  });

  it("finishes an interrupted exit after resubscribing", async () => {
    const store = createConsentBannerState(pendingConsent(), 0);
    const unsubscribe = store.subscribe(vi.fn());
    store.close();
    await vi.advanceTimersByTimeAsync(MOTION_MODAL_EXIT / 2);
    unsubscribe();
    const next = store.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(MOTION_MODAL_EXIT / 2);
    expect(store.getSnapshot().phase).toBe("closed");
    next();
  });
});
