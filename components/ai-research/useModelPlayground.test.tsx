import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { newColumn } from "@/lib/model-playground/composer-state";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useModelPlayground } from "./useModelPlayground";

afterEach(() => vi.useRealTimers());

function setup(canRun = true) {
  const fixture = composerFixture();
  const service = createFakeModelPlaygroundLaunchService(fixture);
  const launch = vi.spyOn(service, "launch");
  const preview = vi.spyOn(service, "preview");
  const hook = renderHook(() => useModelPlayground({ ...fixture, service, canRun, debounceMs: 5 }));
  return { ...hook, ...fixture, launch, preview };
}
describe("composer free preflight and launch", () => {
  it.each(["prompt", "language", "search", "market", "settings", "remove", "reorder", "add"])(
    "invalidates a settled quote immediately after %s",
    async (kind) => {
      const hook = setup();
      await waitFor(() => expect(hook.result.current.canLaunch).toBe(true));
      act(() => {
        const h = hook.result.current;
        if (kind === "prompt") h.form.setValue("prompt", "Changed question");
        if (kind === "language") h.form.setValue("responseLanguage", "pl");
        if (kind === "search") h.setSearch(true);
        if (kind === "market") h.setMarket("PL");
        if (kind === "settings")
          h.updateColumn(h.input.columns[0].columnId, {
            ...h.input.columns[0],
            settings: { ...h.input.columns[0].settings, maxOutputTokens: 512 },
          });
        if (kind === "remove") h.removeColumn(h.input.columns[0].columnId);
        if (kind === "reorder") h.moveColumn(h.input.columns[0].columnId, 1);
        if (kind === "add") h.addColumn(newColumn(hook.catalogs[2].models[0], hook.connections[2]));
      });
      expect(hook.result.current.canLaunch).toBe(false);
      await act(async () => {
        await hook.result.current.run();
      });
      expect(hook.launch).not.toHaveBeenCalled();
      await waitFor(() => expect(hook.result.current.canLaunch).toBe(true));
    },
  );
  it("launches once on a double click with the exact quote revision and consent", async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.canLaunch).toBe(true));
    const quote = hook.result.current.quote;
    if (!quote) throw new Error("Expected a quote");
    await act(async () => {
      await Promise.all([hook.result.current.run(), hook.result.current.run()]);
    });
    expect(hook.launch).toHaveBeenCalledTimes(1);
    expect(hook.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: quote.revision,
        previewId: quote.previewId,
        configHash: quote.configHash,
        byokConsent: "non_guaranteed_estimate_v1",
      }),
    );
  });
  it("keeps the supported search route and explicitly identifies the unsupported column", async () => {
    const hook = setup();
    act(() => hook.result.current.setSearch(true));
    expect(hook.result.current.input.columns[0].settings.search.mode).toBe("openai_web_search");
    expect(hook.result.current.input.columns[1].settings.search.mode).toBe("off");
    expect(hook.result.current.unsupportedSearch).toEqual([hook.input.columns[1].columnId]);
  });
  it("preserves ids after reordering and refuses a seventh", () => {
    const hook = setup();
    const ids = hook.result.current.input.columns.map((c) => c.columnId);
    act(() => hook.result.current.moveColumn(ids[0], 1));
    expect(hook.result.current.input.columns.map((c) => c.columnId)).toEqual([...ids].reverse());
    act(() => {
      for (let i = 0; i < 6; i++)
        hook.result.current.addColumn(newColumn(hook.catalogs[0].models[0], hook.connections[0]));
    });
    expect(hook.result.current.form.getValues("columns")).toHaveLength(6);
  });
  it("keeps read-only views free of preview and launch requests", async () => {
    const hook = setup(false);
    await act(async () => {
      await hook.result.current.run();
    });
    expect(hook.result.current.canLaunch).toBe(false);
    expect(hook.preview).not.toHaveBeenCalled();
    expect(hook.launch).not.toHaveBeenCalled();
  });
});

it("aborts superseded previews and ignores late responses from services that ignore abort", async () => {
  const fixture = composerFixture();
  const fake = createFakeModelPlaygroundLaunchService(fixture);
  const calls: { signal: AbortSignal; resolve: () => Promise<void> }[] = [];
  const service = {
    ...fake,
    preview: vi.fn(
      (request, signal) =>
        new Promise<Awaited<ReturnType<typeof fake.preview>>>((resolve) => {
          calls.push({
            signal,
            resolve: async () => resolve(await fake.preview(request, new AbortController().signal)),
          });
        }),
    ),
  } satisfies typeof fake;
  const hook = renderHook(() =>
    useModelPlayground({ ...fixture, service, canRun: true, debounceMs: 1 }),
  );
  await waitFor(() => expect(calls).toHaveLength(1));
  act(() => hook.result.current.form.setValue("prompt", "Next question"));
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[0].signal.aborted).toBe(true);
  await act(calls[1].resolve);
  const current = hook.result.current.quote?.revision;
  await act(calls[0].resolve);
  expect(hook.result.current.quote?.revision).toBe(current);
  expect(hook.result.current.canLaunch).toBe(true);
});

it("rechecks connection and catalog changes against a settled quote", async () => {
  const fixture = composerFixture();
  const service = createFakeModelPlaygroundLaunchService(fixture);
  const hook = renderHook(
    ({ connections, catalogs }) =>
      useModelPlayground({
        ...fixture,
        connections,
        catalogs,
        service,
        canRun: true,
        debounceMs: 1,
      }),
    { initialProps: fixture },
  );
  await waitFor(() => expect(hook.result.current.canLaunch).toBe(true));
  hook.rerender({
    ...fixture,
    connections: fixture.connections.map((item, i) => (i ? item : { ...item, enabled: false })),
  });
  expect(hook.result.current.canLaunch).toBe(false);
  expect(hook.result.current.input.columns).toHaveLength(2);
  hook.rerender({
    ...fixture,
    catalogs: fixture.catalogs.map((item, i) => (i ? item : { ...item, models: [] })),
  });
  expect(hook.result.current.canLaunch).toBe(false);
});

it("expires quotes without letting a stale Run launch", async () => {
  vi.useFakeTimers();
  const fixture = composerFixture();
  const fake = createFakeModelPlaygroundLaunchService(fixture);
  const service = {
    ...fake,
    preview: async (...args: Parameters<typeof fake.preview>) => ({
      ...(await fake.preview(...args)),
      expiresAt: new Date(Date.now() + 100).toISOString(),
    }),
    launch: vi.fn(fake.launch),
  };
  const hook = renderHook(() =>
    useModelPlayground({ ...fixture, service, canRun: true, debounceMs: 1 }),
  );
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(hook.result.current.canLaunch).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(100));
  expect(hook.result.current.canLaunch).toBe(false);
  await act(() => hook.result.current.run());
  expect(service.launch).not.toHaveBeenCalled();
});
