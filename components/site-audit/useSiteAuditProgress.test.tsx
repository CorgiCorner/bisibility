import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { auditFixture } from "./story-fixtures";
import { useSiteAuditProgress } from "./useSiteAuditProgress";

const active = {
  ...auditFixture,
  run: {
    state: "running",
    stopReason: null,
    pagesCrawled: 2,
    budgetPages: 15,
    requests: 3,
    startedAt: null,
    completedAt: null,
  },
};
function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}
afterEach(() => vi.useRealTimers());
it("ignores a pending poll after cancel and allows the next resumed generation", async () => {
  vi.useFakeTimers();
  let resolvePoll = (_value: typeof active) => {};
  const read = vi.fn().mockImplementationOnce(
    () =>
      new Promise<typeof active>((resolve) => {
        resolvePoll = resolve;
      }),
  );
  const { result } = renderHook(
    () =>
      useSiteAuditProgress({
        projectId: "project",
        initial: active,
        readAction: read,
        paused: false,
      }),
    { wrapper },
  );
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(read).toHaveBeenCalledTimes(1);
  const cancelled = {
    ...active,
    run: { ...active.run, state: "cancelled", stopReason: "cancelled" },
  };
  read.mockResolvedValue(cancelled);
  await act(async () => {
    await result.current.cancelPending();
    await result.current.refresh();
  });
  await act(async () => resolvePoll(active));
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result.current.saved?.run?.state).toBe("cancelled");
  read.mockResolvedValue(active);
  await act(async () => {
    await result.current.cancelPending();
    await result.current.refresh();
  });
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result.current.saved?.run?.state).toBe("running");
});
it("keeps reports isolated when a read for the previously selected report completes", async () => {
  const read = vi.fn(async () => active);
  const { result } = renderHook(
    () =>
      useSiteAuditProgress({
        projectId: "project",
        initial: active,
        readAction: read,
        paused: false,
      }),
    { wrapper },
  );
  const other = { ...active, id: "agr_other" };
  act(() => result.current.setSaved(other));
  await waitFor(() => expect(result.current.saved?.id).toBe(other.id));
});

it("stops polling on a terminal response", async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValue({ ...active, run: { ...active.run, state: "complete" } });
  const { result } = renderHook(
    () =>
      useSiteAuditProgress({
        projectId: "project",
        initial: active,
        readAction: read,
        paused: false,
      }),
    { wrapper },
  );
  await act(() => vi.advanceTimersByTimeAsync(3000));
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result.current.saved?.run?.state).toBe("complete");
  await act(() => vi.advanceTimersByTimeAsync(9000));
  expect(read).toHaveBeenCalledTimes(1);
});

it("ignores a response for another report", async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValue({ ...active, id: "agr_other" });
  const { result } = renderHook(
    () =>
      useSiteAuditProgress({
        projectId: "project",
        initial: active,
        readAction: read,
        paused: false,
      }),
    { wrapper },
  );
  await act(() => vi.advanceTimersByTimeAsync(3001));
  expect(read).toHaveBeenCalledTimes(1);
  expect(result.current.saved?.id).toBe(active.id);
});

it("does not hide a missing report after a control refresh", async () => {
  const { result } = renderHook(
    () =>
      useSiteAuditProgress({
        projectId: "project",
        initial: active,
        readAction: async () => null,
        paused: true,
      }),
    { wrapper },
  );
  let refreshed: unknown;
  await act(async () => {
    refreshed = await result.current.refresh();
  });
  expect(refreshed).toBeNull();
});
it("does not let a pending poll overwrite an explicitly selected terminal report", async () => {
  vi.useFakeTimers();
  let resolvePoll = (_value: typeof active) => {};
  const read = vi.fn(
    () =>
      new Promise<typeof active>((resolve) => {
        resolvePoll = resolve;
      }),
  );
  const { result } = renderHook(
    () =>
      useSiteAuditProgress({
        projectId: "project",
        initial: active,
        readAction: read,
        paused: false,
      }),
    { wrapper },
  );
  await act(() => vi.advanceTimersByTimeAsync(3000));
  act(() => result.current.setSaved({ ...active, run: { ...active.run, state: "complete" } }));
  await act(async () => resolvePoll(active));
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result.current.saved?.run?.state).toBe("complete");
});
