import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppRealtimeState } from "./useAppRealtime";

class Source {
  static CLOSED = 2;
  static CONNECTING = 0;
  static instance: Source;
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, EventListener>();
  constructor() {
    Source.instance = this;
  }
  close() {}
  addEventListener(name: string, fn: EventListener) {
    this.listeners.set(name, fn);
  }
  emit(revision: string) {
    this.listeners.get("operations")?.(
      new MessageEvent("operations", {
        data: JSON.stringify({ operations: [], rankDataRevision: revision }),
      }),
    );
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  error(state = Source.CLOSED) {
    this.readyState = state;
    this.onerror?.();
  }
}
function visible(value: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: value ? "visible" : "hidden",
  });
  Object.defineProperty(document, "hidden", { configurable: true, value: !value });
}
async function tick(ms = 1_000) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}
function setup() {
  const refresh = vi.fn();
  const view = renderHook(() => useAppRealtimeState("prj_1", refresh));
  return { ...view, refresh, source: Source.instance };
}
describe("live result recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visible(true);
    vi.stubGlobal("EventSource", Source);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ operations: [], rankDataRevision: "new" }),
      })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    visible(true);
  });
  it("refreshes keyword grid and tray consumers for a short run missing the active set", async () => {
    const { refresh, source } = setup();
    act(() => source.emit("before"));
    await tick();
    refresh.mockClear();
    act(() => source.emit("after"));
    await tick();
    expect(refresh).toHaveBeenCalledOnce();
    act(() => source.emit("after"));
    await tick();
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("reconciles the render-to-first-snapshot gap", async () => {
    const { source, refresh } = setup();
    act(() => source.emit("already-finished"));
    await tick();
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("coalesces visible focus visibility and reconnect with an open stream", async () => {
    const { source, refresh } = setup();
    act(() => source.open());
    await tick();
    expect(refresh).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    act(() => {
      source.error(0);
      source.open();
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await tick();
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("refetches after rotation opens again without an error callback", async () => {
    const { source, refresh } = setup();
    act(() => source.open());
    act(() => source.open());
    await tick();
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("ignores hidden focus visibility and reconnect", async () => {
    const { source, refresh } = setup();
    visible(false);
    act(() => {
      source.open();
      source.error();
      source.open();
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await tick(60_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never polls visible live streams", async () => {
    const { source } = setup();
    act(() => source.open());
    for (let i = 0; i < 5; i++) {
      await tick(25_000);
      act(() => source.listeners.get("heartbeat")?.(new Event("heartbeat")));
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([0, 2])(
    "polls visible down streams with no active operations every 30 seconds (state %s)",
    async (state) => {
      const { source, refresh } = setup();
      act(() => source.error(state));
      await tick(29_999);
      expect(fetch).not.toHaveBeenCalled();
      await tick(1);
      expect(fetch).toHaveBeenCalledOnce();
      await tick();
      expect(refresh).toHaveBeenCalledOnce();
      await tick(29_000);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it("stops polling immediately on hide and resumes on visible", async () => {
    const { source } = setup();
    act(() => source.error());
    await tick(20_000);
    visible(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(vi.getTimerCount()).toBe(0);
    await tick(90_000);
    expect(fetch).not.toHaveBeenCalled();
    visible(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("stops polling on recovery", async () => {
    const { source } = setup();
    act(() => source.error());
    await tick(20_000);
    act(() => source.open());
    expect(vi.getTimerCount()).toBe(2); // Recovery refresh and stream watchdog.
    for (let i = 0; i < 5; i++) {
      await tick(25_000);
      act(() => source.listeners.get("heartbeat")?.(new Event("heartbeat")));
    }
    expect(fetch).toHaveBeenCalledOnce(); // Recovery reconciliation only.
  });
  it("backs off failures within 30 to 60 seconds", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const { source } = setup();
    act(() => source.error());
    await tick(30_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await tick(30_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await tick(59_999);
    expect(fetch).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("uses visible down fallback when EventSource is unsupported", async () => {
    vi.stubGlobal("EventSource", undefined);
    const { refresh } = setup();
    await tick(29_999);
    expect(fetch).not.toHaveBeenCalled();
    await tick(1_001);
    expect(fetch).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("discards in-flight fallback results after the tab hides", async () => {
    let resolve: (response: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const { source, refresh, result } = setup();
    act(() => source.error());
    await tick(30_000);
    visible(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () =>
      resolve({
        ok: true,
        json: async () => ({ operations: [], rankDataRevision: "late" }),
      } as Response),
    );
    await tick(60_000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.rankDataVersion).toBe(0);
  });
  it("discards previous-project HTTP results and queued refreshes", async () => {
    let resolve: (response: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const refresh = vi.fn();
    const view = renderHook(({ project }) => useAppRealtimeState(project, refresh), {
      initialProps: { project: "old" },
    });
    const old = Source.instance;
    act(() => old.error());
    await tick(30_000);
    view.rerender({ project: "new" });
    await act(async () =>
      resolve({
        ok: true,
        json: async () => ({ operations: [], rankDataRevision: "old" }),
      } as Response),
    );
    act(() => old.emit("old-late-event"));
    await tick();
    expect(refresh).not.toHaveBeenCalled();
    expect(view.result.current.rankDataVersion).toBe(0);
  });
});
