import type { ModelPlaygroundCatalogLoader } from "@/lib/model-playground/catalog-request";
import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useModelPlaygroundCatalogs } from "./useModelPlaygroundCatalogs";

afterEach(() => vi.useRealTimers());
it("keeps a workspace catalog across a server refresh for the same account", () => {
  const { catalogs, connections } = composerFixture();
  const base = catalogs[1];
  expect(base.providerId).toBe("anthropic");
  const workspace = { ...base, workspaceId: "wrkspc_same", accountDigest: "b".repeat(64) };
  const h = renderHook(({ source }) => useModelPlaygroundCatalogs(source, connections), {
    initialProps: { source: catalogs },
  });
  act(() => h.result.current.setCatalogs([...catalogs, workspace]));
  h.rerender({ source: catalogs.map((item) => ({ ...item })) });
  expect(h.result.current.catalogs).toContain(workspace);
  h.rerender({ source: catalogs.map((item) => ({ ...item, accountDigest: "changed" })) });
  expect(h.result.current.catalogs).not.toContain(workspace);
});
it("refreshes expired metadata once and accepts a new server projection", async () => {
  vi.useFakeTimers();
  const { catalogs, connections } = composerFixture();
  catalogs[0].expiresAt = new Date(Date.now() + 100).toISOString();
  const fresh = { ...catalogs[0], expiresAt: new Date(Date.now() + 60000).toISOString() };
  const load = vi.fn<ModelPlaygroundCatalogLoader>(async () => fresh);
  const h = renderHook(({ source }) => useModelPlaygroundCatalogs(source, connections, load), {
    initialProps: { source: catalogs },
  });
  await act(() => vi.advanceTimersByTimeAsync(99));
  expect(load).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(load).toHaveBeenCalledTimes(1);
  expect(load.mock.calls[0][0]).toEqual({
    providerId: "openai",
    connectionId: connections[0].connectionId,
  });
  expect(h.result.current.catalogs.find((c) => c.providerId === "openai")).toEqual(fresh);
  const next = catalogs.map((c) => ({
    ...c,
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  }));
  h.rerender({ source: next });
  expect(h.result.current.catalogs).toEqual(next);
  h.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it("does not loop or relax an expired catalog after a failed read", async () => {
  vi.useFakeTimers();
  const { catalogs, connections } = composerFixture();
  catalogs[0].expiresAt = new Date(Date.now() - 1).toISOString();
  const load = vi.fn(async () => {
    throw new Error("Unavailable");
  });
  const h = renderHook(() => useModelPlaygroundCatalogs(catalogs, connections, load));
  await act(() => vi.advanceTimersByTimeAsync(600000));
  expect(load).toHaveBeenCalledTimes(1);
  expect(h.result.current.catalogs).toEqual(catalogs);
  h.unmount();
});
it("aborts a metadata read when its connection scope changes", async () => {
  vi.useFakeTimers();
  const { catalogs, connections } = composerFixture();
  catalogs[0].expiresAt = new Date(Date.now() - 1).toISOString();
  let signal: AbortSignal | undefined;
  const load = vi.fn(async (_request: unknown, current: AbortSignal) => {
    signal = current;
    return new Promise<(typeof catalogs)[number]>(() => {});
  });
  const h = renderHook(({ available }) => useModelPlaygroundCatalogs(catalogs, available, load), {
    initialProps: { available: connections },
  });
  h.rerender({ available: connections.map((c) => ({ ...c, enabled: false })) });
  expect(signal?.aborted).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(600000));
  expect(load).toHaveBeenCalledTimes(1);
  h.unmount();
});
it("allows an explicit retry after expiry refresh failed without changing the draft scope", async () => {
  vi.useFakeTimers();
  const { catalogs, connections } = composerFixture();
  catalogs[0].expiresAt = new Date(Date.now() - 1).toISOString();
  const fresh = { ...catalogs[0], expiresAt: new Date(Date.now() + 60000).toISOString() };
  const load = vi
    .fn<ModelPlaygroundCatalogLoader>()
    .mockRejectedValueOnce(new Error("Temporary metadata failure"))
    .mockResolvedValueOnce(fresh);
  const h = renderHook(() => useModelPlaygroundCatalogs(catalogs, connections, load));
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(load).toHaveBeenCalledTimes(1);
  expect(h.result.current.catalogs).toEqual(catalogs);
  await act(async () => h.result.current.refreshCatalogs());
  expect(load).toHaveBeenCalledTimes(2);
  expect(load.mock.calls[1][0]).toEqual(load.mock.calls[0][0]);
  expect(h.result.current.catalogs.find((c) => c.providerId === "openai")).toEqual(fresh);
  h.unmount();
});
