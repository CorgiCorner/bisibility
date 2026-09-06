import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppRealtimeState } from "./useAppRealtime";

class MockEventSource {
  static CLOSED = 2;
  static CONNECTING = 0;
  static instances: MockEventSource[] = [];

  listeners = new Map<string, EventListener>();
  onerror: EventListener | null = null;
  onopen: EventListener | null = null;
  readyState = MockEventSource.CONNECTING;
  close = vi.fn();

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, listener);
  }

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.(
      new MessageEvent(type, { data: typeof data === "string" ? data : JSON.stringify(data) }),
    );
  }
}

const activeOperations = [
  {
    id: "import_1",
    kind: "gsc_import",
    progress: { done: 2, total: 4 },
    state: "running",
  },
] as const;

describe("useAppRealtimeState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ operations: activeOperations }))),
    );
  });

  afterEach(() => {
    MockEventSource.instances = [];
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function renderRealtime() {
    const hook = renderHook(() => useAppRealtimeState("prj_1"));
    const source = MockEventSource.instances[0];
    act(() => source.emit("operations", { operations: activeOperations }));
    return { ...hook, source };
  }

  it("reports server-side polling without starting the HTTP fallback", async () => {
    const { result, source } = renderRealtime();

    act(() => {
      source.onopen?.(new Event("open"));
      source.emit("degraded", { mode: "polling", retrying: true });
    });
    await act(async () => vi.advanceTimersByTimeAsync(30_000));

    expect(source.url).toBe("/api/realtime/stream?project=prj_1");
    expect(result.current.status).toBe("live-polling");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("polls operations within five seconds after the stream closes", async () => {
    const { result, source } = renderRealtime();
    source.readyState = MockEventSource.CLOSED;
    act(() => source.onerror?.(new Event("error")));

    expect(result.current.status).toBe("offline");
    await act(async () => vi.advanceTimersByTimeAsync(5_000));

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/operations?project=prj_1", {
      cache: "no-store",
      credentials: "same-origin",
    });
  });

  it("reports reconnecting while the browser owns the retry", () => {
    const { result, source } = renderRealtime();

    act(() => source.onerror?.(new Event("error")));

    expect(result.current.status).toBe("reconnecting");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("backs off fallback errors from fifteen to thirty seconds", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const { source } = renderRealtime();
    source.readyState = MockEventSource.CLOSED;
    act(() => source.onerror?.(new Event("error")));

    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("refreshes immediately when the hidden document becomes visible", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const { source } = renderRealtime();
    source.readyState = MockEventSource.CLOSED;
    act(() => source.onerror?.(new Event("error")));
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(fetch).not.toHaveBeenCalled();

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));

    expect(fetch).toHaveBeenCalledOnce();
  });

  it("stops the fallback on reconnect and never polls without active operations", async () => {
    const { source } = renderRealtime();
    source.readyState = MockEventSource.CLOSED;
    act(() => source.onerror?.(new Event("error")));
    source.readyState = MockEventSource.CONNECTING;
    act(() => source.onopen?.(new Event("open")));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetch).not.toHaveBeenCalled();

    MockEventSource.instances = [];
    const empty = renderHook(() => useAppRealtimeState("prj_empty"));
    const emptySource = MockEventSource.instances[0];
    emptySource.readyState = MockEventSource.CLOSED;
    act(() => emptySource.onerror?.(new Event("error")));
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetch).not.toHaveBeenCalled();
    empty.unmount();
  });
});
