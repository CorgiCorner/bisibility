import type { NotificationFeed } from "@/lib/queries/notifications";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNotificationStream } from "./useNotificationStream";

class MockEventSource {
  static CLOSED = 2;
  static instances: MockEventSource[] = [];

  listeners = new Map<string, EventListener>();
  onerror: EventListener | null = null;
  onopen: EventListener | null = null;
  readyState = 0;
  close = vi.fn();

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, listener);
  }

  emit(type: string, event: Event) {
    this.listeners.get(type)?.(event);
  }
}

const initialFeed: NotificationFeed = { items: [], unreadCount: 0 };
const updatedFeed: NotificationFeed = { items: [], unreadCount: 2 };

describe("useNotificationStream", () => {
  afterEach(() => {
    MockEventSource.instances = [];
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps the latest feed and reports offline when the server degrades", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const { result, unmount } = renderHook(() =>
      useNotificationStream(initialFeed, "prj_1", async () => initialFeed),
    );
    const source = MockEventSource.instances[0];

    act(() => {
      source.onopen?.(new Event("open"));
      source.emit(
        "notification",
        new MessageEvent("notification", { data: JSON.stringify({ feed: updatedFeed }) }),
      );
      source.emit("degraded", new MessageEvent("degraded", { data: '{"mode":"polling"}' }));
      source.onerror?.(new Event("error"));
    });

    expect(source.url).toBe("/api/notifications/stream?project=prj_1");
    expect(result.current).toEqual({ feed: updatedFeed, status: "offline" });
    unmount();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("uses request polling without opening EventSource when configured", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", MockEventSource);
    const refresh = vi.fn(async () => updatedFeed);
    const useConfiguredStream = useNotificationStream as unknown as (
      feed: NotificationFeed,
      projectRef: string,
      refreshFeed: () => Promise<NotificationFeed>,
      transport: "polling" | "stream",
    ) => ReturnType<typeof useNotificationStream>;
    const { result } = renderHook(() =>
      useConfiguredStream(initialFeed, "prj_1", refresh, "polling"),
    );

    expect(MockEventSource.instances).toHaveLength(0);
    expect(result.current.status).toBe("live");
    await act(async () => vi.advanceTimersByTimeAsync(4_000));

    expect(refresh).toHaveBeenCalledOnce();
    expect(result.current).toEqual({ feed: updatedFeed, status: "live" });
  });
});
