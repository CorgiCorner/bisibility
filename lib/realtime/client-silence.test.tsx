import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STREAM_SILENCE_MS } from "./client-subscription";
import { HEARTBEAT_INTERVAL_MS } from "./sse";
import { useAppRealtimeState } from "./useAppRealtime";

class Source {
  static CLOSED = 2;
  static instances: Source[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, EventListener>();
  close = vi.fn(() => {
    this.readyState = 2;
  });
  constructor() {
    Source.instances.push(this);
  }
  addEventListener(name: string, listener: EventListener) {
    this.listeners.set(name, listener);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  heartbeat() {
    this.listeners.get("heartbeat")?.(new MessageEvent("heartbeat", { data: "null" }));
  }
}
function visibility(value: string) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
}
async function tick(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}
function setup() {
  const view = renderHook(() => useAppRealtimeState("prj_1"));
  const source = Source.instances[0];
  act(() => source.open());
  return { ...view, source };
}
describe("silent realtime streams", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility("visible");
    Source.instances = [];
    vi.stubGlobal("EventSource", Source);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ operations: [], rankDataRevision: "r1" }),
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("keeps an open stream alive while named heartbeats arrive", async () => {
    const { source, result } = setup();
    for (let i = 0; i < 6; i++) {
      await tick(HEARTBEAT_INTERVAL_MS);
      act(() => source.heartbeat());
    }
    expect(source.close).not.toHaveBeenCalled();
    expect(result.current.status).toBe("live");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reopens after two heartbeat intervals plus margin, never earlier", async () => {
    const { source, result } = setup();
    await tick(STREAM_SILENCE_MS - 1);
    expect(source.close).not.toHaveBeenCalled();
    await tick(1);
    expect(source.close).toHaveBeenCalledOnce();
    expect(Source.instances).toHaveLength(2);
    expect(result.current.status).toBe("reconnecting");
    await tick(29_999);
    expect(fetch).not.toHaveBeenCalled();
    await tick(1);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("never polls hidden tabs, including after silence", async () => {
    const { source } = setup();
    await tick(STREAM_SILENCE_MS);
    act(() => visibility("hidden"));
    await tick(120_000);
    expect(fetch).not.toHaveBeenCalled();
    expect(source.close).toHaveBeenCalledOnce();
  });
  it("detects silence while hidden without polling", async () => {
    const { source } = setup();
    act(() => visibility("hidden"));
    await tick(STREAM_SILENCE_MS);
    expect(source.close).toHaveBeenCalledOnce();
    await tick(120_000);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("counts error events as transport activity", async () => {
    const { source } = setup();
    for (let i = 0; i < 6; i++) {
      await tick(HEARTBEAT_INTERVAL_MS);
      act(() =>
        source.listeners.get("notification-error")?.(
          new MessageEvent("notification-error", { data: "null" }),
        ),
      );
    }
    expect(source.close).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("ignores heartbeats from a replaced source", async () => {
    const { source } = setup();
    await tick(STREAM_SILENCE_MS);
    const replacement = Source.instances[1];
    act(() => replacement.open());
    await tick(30_000);
    act(() => source.heartbeat());
    await tick(STREAM_SILENCE_MS - 30_000);
    expect(replacement.close).toHaveBeenCalledOnce();
  });
  it("clears the silence timer on unmount", async () => {
    const view = setup();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await tick(STREAM_SILENCE_MS + 30_000);
    expect(Source.instances).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("ignores open, errors and payloads from replaced sources", async () => {
    const { source, result } = setup();
    await tick(STREAM_SILENCE_MS);
    act(() => source.open());
    expect(result.current.status).toBe("reconnecting");
    act(() => {
      source.readyState = 2;
      source.onerror?.();
    });
    expect(result.current.status).toBe("reconnecting");
    act(() =>
      source.listeners.get("operations")?.(
        new MessageEvent("operations", {
          data: JSON.stringify({ operations: [], rankDataRevision: "obsolete" }),
        }),
      ),
    );
    await tick(1_000);
    expect(result.current.rankDataVersion).toBe(0);
  });
  it("recovery stops fallback and old source events cannot revive it", async () => {
    const { source, result } = setup();
    await tick(STREAM_SILENCE_MS);
    act(() => Source.instances[1].open());
    await tick(1_000);
    expect(fetch).toHaveBeenCalledOnce();
    for (let i = 0; i < 4; i++) {
      await tick(HEARTBEAT_INTERVAL_MS);
      act(() => Source.instances[1].heartbeat());
    }
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("live");
    expect(source.close).toHaveBeenCalledOnce();
  });
});
