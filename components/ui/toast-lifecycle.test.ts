import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToastLifecycle } from "./toast-lifecycle";

describe("createToastLifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onExpire after the duration and exposes exact remaining time", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.start(3200, onExpire);

    expect(lc.remainingMs).toBe(3200);
    expect(lc.isPaused).toBe(false);
    expect(lc.isExpired).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(lc.remainingMs).toBe(2200);

    vi.advanceTimersByTime(2250);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(lc.isExpired).toBe(true);
  });

  it("stores exact remainingMs on pause and resumes with the remainder", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.start(3200, onExpire);

    vi.advanceTimersByTime(1000);
    lc.pause("hover");

    expect(lc.remainingMs).toBe(2200);
    expect(lc.isPaused).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(onExpire).not.toHaveBeenCalled();

    lc.resume("hover");
    expect(lc.isPaused).toBe(false);

    vi.advanceTimersByTime(2199);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(51);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("nests multiple pause reasons and only resumes after the last is removed", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.start(3200, onExpire);

    vi.advanceTimersByTime(200);
    lc.pause("hover");
    lc.pause("focus");

    expect(lc.isPaused).toBe(true);

    lc.resume("hover");
    expect(lc.isPaused).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(onExpire).not.toHaveBeenCalled();

    lc.resume("focus");
    expect(lc.isPaused).toBe(false);

    vi.advanceTimersByTime(lc.remainingMs + 100);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("supports hidden-before-start: pause before start keeps full duration", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.pause("hidden");
    lc.start(8000, onExpire);

    expect(lc.isPaused).toBe(true);
    expect(lc.remainingMs).toBe(8000);

    vi.advanceTimersByTime(10_000);
    expect(onExpire).not.toHaveBeenCalled();

    lc.resume("hidden");
    expect(lc.isPaused).toBe(false);

    vi.advanceTimersByTime(7999);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(51);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("expire is idempotent: fires callback exactly once", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.start(3200, onExpire);

    lc.expire();
    lc.expire();
    lc.expire();

    expect(onExpire).toHaveBeenCalledOnce();
    expect(lc.isExpired).toBe(true);
  });

  it("cancel is idempotent and does not fire onExpire", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.start(3200, onExpire);

    lc.cancel();
    lc.cancel();

    expect(onExpire).not.toHaveBeenCalled();
    expect(lc.isExpired).toBe(true);

    vi.advanceTimersByTime(10_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("dispose is idempotent and prevents further operations", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.start(3200, onExpire);

    lc.dispose();
    lc.dispose();

    expect(lc.isDisposed).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("pause/resume after expiry are no-ops", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.start(3200, onExpire);
    lc.expire();

    lc.pause("hover");
    lc.resume("hover");
    lc.cancel();
    lc.dispose();

    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("start after dispose or expiry is a no-op", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.dispose();
    lc.start(3200, onExpire);
    vi.advanceTimersByTime(10_000);
    expect(onExpire).not.toHaveBeenCalled();

    const lc2 = createToastLifecycle();
    lc2.start(3200, onExpire);
    lc2.expire();
    lc2.start(3200, onExpire);
    vi.advanceTimersByTime(10_000);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("sequential pause/resume subtracts from the current remainder, not the original total", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.start(3200, onExpire);

    vi.advanceTimersByTime(1000);
    lc.pause("hover");
    expect(lc.remainingMs).toBe(2200);

    lc.resume("hover");
    vi.advanceTimersByTime(500);
    lc.pause("hover");
    expect(lc.remainingMs).toBe(1700);

    lc.resume("hover");
    vi.advanceTimersByTime(1699);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("expires exactly at the deadline with no expiry buffer", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.start(1000, onExpire);

    vi.advanceTimersByTime(999);
    expect(lc.remainingMs).toBe(1);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(lc.remainingMs).toBe(0);
  });

  it("resume with zero remaining fires expiry instead of going immortal", () => {
    const onExpire = vi.fn();
    const lc = createToastLifecycle();
    lc.start(0, onExpire);
    lc.pause("hover");
    expect(lc.remainingMs).toBe(0);
    expect(lc.isPaused).toBe(true);

    lc.resume("hover");
    expect(onExpire).toHaveBeenCalledOnce();
    expect(lc.isExpired).toBe(true);
  });

  it("remainingMs is zero after cancel or dispose", () => {
    const lc = createToastLifecycle();
    lc.start(3200, vi.fn());
    lc.cancel();
    expect(lc.remainingMs).toBe(0);

    const lc2 = createToastLifecycle();
    lc2.start(3200, vi.fn());
    lc2.dispose();
    expect(lc2.remainingMs).toBe(0);
  });
});
