import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useModelPlaygroundQuote } from "./useModelPlaygroundQuote";

afterEach(() => vi.useRealTimers());
it("caps and re-arms a quote expiry longer than the maximum timer delay", async () => {
  vi.useFakeTimers();
  const fixture = composerFixture();
  const fake = createFakeModelPlaygroundLaunchService(fixture);
  const ttl = 2 ** 31 + 5000;
  const service = {
    ...fake,
    preview: async (...args: Parameters<typeof fake.preview>) => ({
      ...(await fake.preview(...args)),
      expiresAt: new Date(Date.now() + ttl).toISOString(),
    }),
  };
  const hook = renderHook(() =>
    useModelPlaygroundQuote(service, fixture.input, "revision", true, 1),
  );
  await act(() => vi.advanceTimersByTimeAsync(10));
  expect(hook.result.current.quote).not.toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(2 ** 31 - 1));
  expect(hook.result.current.quote).not.toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(hook.result.current.quote).toBeNull();
});
it("clears a failed preview as soon as the next revision starts", async () => {
  vi.useFakeTimers();
  const fixture = composerFixture();
  const fake = createFakeModelPlaygroundLaunchService(fixture);
  const service = {
    ...fake,
    preview: vi.fn(fake.preview).mockRejectedValueOnce(new Error("failed")),
  };
  const hook = renderHook(
    ({ revision }) => useModelPlaygroundQuote(service, fixture.input, revision, true, 100),
    { initialProps: { revision: "one" } },
  );
  await act(() => vi.advanceTimersByTimeAsync(100));
  expect(hook.result.current.failed).toBe(true);
  hook.rerender({ revision: "two" });
  expect(hook.result.current.failed).toBe(false);
  await act(() => vi.advanceTimersByTimeAsync(100));
  expect(hook.result.current.quote?.revision).toBe("two");
});

it("explicit invalidation replaces a quote without changing dependencies and fences old callbacks", async () => {
  vi.useFakeTimers();
  const fixture = composerFixture();
  const service = createFakeModelPlaygroundLaunchService(fixture);
  const preview = vi.spyOn(service, "preview");
  const h = renderHook(() => useModelPlaygroundQuote(service, fixture.input, "revision", true, 10));
  try {
    await act(() => vi.advanceTimersByTimeAsync(10));
    const old = h.result.current;
    expect(old.quote).not.toBeNull();
    await act(() => h.result.current.invalidate());
    expect(preview).toHaveBeenCalledTimes(2);
    expect(h.result.current.quote).not.toBeNull();
    expect(h.result.current.quote?.previewId).not.toBe(old.quote?.previewId);
    if (!old.quote) throw new Error("Missing fixture quote");
    expect(old.isCurrent(old.quote)).toBe(false);
    expect(h.result.current.isCurrent(h.result.current.quote!)).toBe(true);
  } finally {
    h.unmount();
    vi.restoreAllMocks();
  }
  expect(vi.getTimerCount()).toBe(0);
});
