import { useRuleEnabledQueue } from "@/components/alerts/alert-rule-enabled-queue";
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

it("resyncs a refreshed enabled prop while idle", () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const { result, rerender } = renderHook(
    ({ enabled }) => useRuleEnabledQueue(enabled, save, "error"),
    { initialProps: { enabled: false } },
  );
  expect(result.current.enabled).toBe(false);
  rerender({ enabled: true });
  expect(result.current.enabled).toBe(true);
  expect(save).not.toHaveBeenCalled();
});

it("keeps a pending intent on prop refresh and saves a toggle", async () => {
  let resolve!: () => void;
  const save = vi.fn().mockReturnValue(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  const { result, rerender } = renderHook(
    ({ enabled }) => useRuleEnabledQueue(enabled, save, "error"),
    { initialProps: { enabled: false } },
  );
  act(() => result.current.request(true));
  rerender({ enabled: true });
  rerender({ enabled: false });
  expect(result.current.enabled).toBe(true);
  expect(save).toHaveBeenCalledWith(true);
  await act(async () => resolve());
  expect(result.current.enabled).toBe(true);
});

function deferredSave() {
  const calls: { reject: (error: Error) => void; resolve: () => void }[] = [];
  const save = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        calls.push({ reject, resolve });
      }),
  );
  return { calls, save };
}

it("rolls a failed save back to the latest server value received while pending", async () => {
  const { calls, save } = deferredSave();
  const { result, rerender } = renderHook(
    ({ enabled }) => useRuleEnabledQueue(enabled, save, "error"),
    { initialProps: { enabled: true } },
  );
  act(() => result.current.request(false));
  rerender({ enabled: false });
  await act(async () => calls[0]?.reject(new Error("network")));
  expect(result.current.enabled).toBe(false);
  expect(result.current.error).toBe("error");
  expect(result.current.pending).toBe(false);
});

it("prefers a later successful save over an older server value on a queued failure", async () => {
  const { calls, save } = deferredSave();
  const { result, rerender } = renderHook(
    ({ enabled }) => useRuleEnabledQueue(enabled, save, "error"),
    { initialProps: { enabled: false } },
  );
  act(() => result.current.request(true));
  rerender({ enabled: true });
  rerender({ enabled: false });
  act(() => result.current.request(false));
  await act(async () => calls[0]?.resolve());
  expect(save).toHaveBeenLastCalledWith(false);
  await act(async () => calls[1]?.reject(new Error("network")));
  expect(result.current.enabled).toBe(true);
  expect(result.current.pending).toBe(false);
});
