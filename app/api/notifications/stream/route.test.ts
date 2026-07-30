import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  getNotificationFeedForScope: vi.fn(),
  getQueryActor: vi.fn(),
  notificationRealtimeRedisConfigured: vi.fn(),
  resolveProjectAccess: vi.fn(),
  subscribeToNotificationEvents: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/feed", () => ({
  getNotificationFeedForScope: mocks.getNotificationFeedForScope,
  notificationFeedSignature: (feed: unknown) => JSON.stringify(feed),
}));
vi.mock("@/lib/notifications/realtime", () => ({
  notificationRealtimeRedisConfigured: mocks.notificationRealtimeRedisConfigured,
  subscribeToNotificationEvents: mocks.subscribeToNotificationEvents,
}));
vi.mock("@/lib/queries/_auth", () => ({
  getQueryActor: mocks.getQueryActor,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));

function streamRequest() {
  return new Request("http://localhost/api/notifications/stream?project=prj_1") as NextRequest;
}

describe("notification stream route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.getQueryActor.mockResolvedValue({ id: "user_1" });
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId: "prj_1",
    });
    mocks.getNotificationFeedForScope.mockResolvedValue({ items: [], unreadCount: 0 });
    mocks.notificationRealtimeRedisConfigured.mockReturnValue(true);
  });

  afterEach(() => vi.useRealTimers());

  it("rejects a stream without an explicit project", async () => {
    const response = await GET(
      new Request("http://localhost/api/notifications/stream") as NextRequest,
    );

    expect(response.status).toBe(400);
    expect(mocks.getQueryActor).not.toHaveBeenCalled();
  });

  it("returns not found when the project reference is inaccessible", async () => {
    mocks.resolveProjectAccess.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    const response = await GET(streamRequest());

    expect(response.status).toBe(404);
    expect(mocks.getNotificationFeedForScope).not.toHaveBeenCalled();
  });

  it("keeps the SSE response alive with a snapshot when subscriber setup throws", async () => {
    mocks.subscribeToNotificationEvents.mockImplementation(() => {
      throw new Error("Redis TLS unavailable");
    });
    const request = streamRequest();

    const response = await GET(request);
    const reader = response.body?.getReader();
    let payload = "";
    for (let index = 0; index < 4; index += 1) {
      const next = await reader?.read();
      payload += new TextDecoder().decode(next?.value);
    }
    await reader?.cancel();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(payload).toContain("retry: 15000");
    expect(payload).toContain("event: notification");
    expect(payload).toContain('"unreadCount":0');
    expect(payload).toContain("event: degraded");
    expect(payload).toContain('"mode":"polling"');
  });

  it("opens an authenticated SSE stream with the initial notification feed", async () => {
    mocks.notificationRealtimeRedisConfigured.mockReturnValue(false);
    const response = await GET(streamRequest());
    const reader = response.body?.getReader();
    const first = await reader?.read();
    const second = await reader?.read();
    const third = await reader?.read();
    await reader?.cancel();

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(first?.value)).toContain("retry: 15000");
    expect(new TextDecoder().decode(second?.value)).toContain(": connected");
    expect(new TextDecoder().decode(third?.value)).toContain("event: notification");
  });

  it("keeps a started response at 200 and degrades when subscriber readiness rejects", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    let rejectReady: (reason: unknown) => void = () => {};
    const ready = new Promise<void>((_resolve, reject) => {
      rejectReady = reject;
    });
    mocks.subscribeToNotificationEvents.mockReturnValue({ close: vi.fn(), ready });

    const response = await GET(streamRequest());
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.read();
    await reader?.read();
    rejectReady("subscriber disconnected after response start");

    const degraded = await reader?.read();
    expect(clearTimeoutSpy).toHaveBeenCalledOnce();
    await reader?.cancel();

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(degraded?.value)).toContain("event: degraded");
  });

  it("degrades to polling when subscriber readiness never settles", async () => {
    mocks.subscribeToNotificationEvents.mockReturnValue({
      close: vi.fn(),
      ready: new Promise<void>(() => {}),
    });

    const response = await GET(streamRequest());
    const reader = response.body?.getReader();
    await reader?.read();
    await reader?.read();
    await reader?.read();
    await vi.advanceTimersByTimeAsync(2_000);
    const degraded = await reader?.read();
    await reader?.cancel();

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(degraded?.value)).toContain("event: degraded");
    expect(new TextDecoder().decode(degraded?.value)).toContain('"mode":"polling"');
  });

  it("returns unauthorized when the session scope cannot be resolved", async () => {
    mocks.getQueryActor.mockRejectedValue(new Error("session unavailable"));

    const response = await GET(streamRequest());

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
  });

  it("returns a paced service-unavailable response when the initial feed cannot load", async () => {
    mocks.getNotificationFeedForScope.mockRejectedValue(new Error("Database unavailable"));
    const request = streamRequest();

    const response = await GET(request);

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("15");
    expect(await response.text()).toBe("Notification stream temporarily unavailable");
    expect(mocks.subscribeToNotificationEvents).not.toHaveBeenCalled();
  });
});
