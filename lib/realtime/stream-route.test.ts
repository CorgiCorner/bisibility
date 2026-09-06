import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./stream-route";

const mocks = vi.hoisted(() => ({
  getResolvedDateFormat: vi.fn(),
  getNotificationFeedForScope: vi.fn(),
  getQueryActor: vi.fn(),
  notificationRealtimeRedisConfigured: vi.fn(),
  readOperationSnapshot: vi.fn(),
  resolveProjectAccess: vi.fn(),
  subscribeToNotificationEvents: vi.fn(),
  subscribeToOperationEvents: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dates/request", () => ({
  getResolvedDateFormat: mocks.getResolvedDateFormat,
}));
vi.mock("@/lib/notifications/feed", () => ({
  getNotificationFeedForScope: mocks.getNotificationFeedForScope,
  notificationFeedSignature: (feed: unknown) => JSON.stringify(feed),
}));
vi.mock("@/lib/notifications/realtime", () => ({
  notificationRealtimeRedisConfigured: mocks.notificationRealtimeRedisConfigured,
  subscribeToNotificationEvents: mocks.subscribeToNotificationEvents,
  subscribeToOperationEvents: mocks.subscribeToOperationEvents,
}));
vi.mock("@/lib/queries/_auth", () => ({
  getQueryActor: mocks.getQueryActor,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/rank-check/runs/snapshot", () => ({
  readOperationSnapshot: mocks.readOperationSnapshot,
}));

function streamRequest() {
  return new Request("https://example.com/api/realtime/stream?project=prj_1") as NextRequest;
}

async function nextText(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const next = await reader.read();
  return new TextDecoder().decode(next.value);
}

describe("app realtime stream", () => {
  let operationHandlers: { onEvent: () => void } | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    operationHandlers = undefined;
    mocks.getQueryActor.mockResolvedValue({ id: "user_1" });
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId: "prj_1",
    });
    mocks.getResolvedDateFormat.mockResolvedValue({ preference: "auto", resolved: "month_first" });
    mocks.getNotificationFeedForScope.mockResolvedValue({ items: [], unreadCount: 0 });
    mocks.readOperationSnapshot.mockResolvedValue([]);
    mocks.notificationRealtimeRedisConfigured.mockReturnValue(true);
    mocks.subscribeToNotificationEvents.mockReturnValue({
      close: vi.fn(),
      ready: Promise.resolve(),
    });
    mocks.subscribeToOperationEvents.mockImplementation((_projectId, handlers) => {
      operationHandlers = handlers;
      return { close: vi.fn(), ready: Promise.resolve() };
    });
  });

  afterEach(() => vi.useRealTimers());

  it("emits notification then operations snapshots on connect", async () => {
    const response = await GET(streamRequest());
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Expected response body.");

    const chunks = [
      await nextText(reader),
      await nextText(reader),
      await nextText(reader),
      await nextText(reader),
    ];
    await reader.cancel();

    expect(chunks[0]).toContain("retry: 15000");
    expect(chunks[1]).toContain(": connected");
    expect(chunks[2]).toContain("event: notification");
    expect(chunks[3]).toContain("event: operations");
  });

  it("applies the resolved date format to initial and polled notification feeds", async () => {
    mocks.getResolvedDateFormat.mockResolvedValue({
      preference: "day_first",
      resolved: "day_first",
    });
    mocks.notificationRealtimeRedisConfigured.mockReturnValue(false);

    const response = await GET(streamRequest());
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Expected response body.");

    await vi.advanceTimersByTimeAsync(4_000);
    await reader.cancel();

    expect(mocks.getResolvedDateFormat).toHaveBeenCalledOnce();
    expect(mocks.getNotificationFeedForScope).toHaveBeenNthCalledWith(
      1,
      { activeProjectId: "project_1", userId: "user_1" },
      { dateFormat: "day_first" },
    );
    expect(mocks.getNotificationFeedForScope).toHaveBeenNthCalledWith(
      2,
      { activeProjectId: "project_1", userId: "user_1" },
      { dateFormat: "day_first" },
    );
  });

  it("coalesces nearby operation invalidations into one snapshot read", async () => {
    const response = await GET(streamRequest());
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Expected response body.");
    for (let index = 0; index < 4; index += 1) await nextText(reader);

    operationHandlers?.onEvent();
    await vi.advanceTimersByTimeAsync(10);
    operationHandlers?.onEvent();
    await vi.advanceTimersByTimeAsync(240);
    const event = await nextText(reader);
    await reader.cancel();

    expect(event).toContain("event: operations");
    expect(mocks.readOperationSnapshot).toHaveBeenCalledTimes(2);
  });

  it("reconciles both snapshots every thirty seconds even without invalidations", async () => {
    const response = await GET(streamRequest());
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Expected response body.");
    for (let index = 0; index < 4; index += 1) await nextText(reader);

    await vi.advanceTimersByTimeAsync(30_000);
    const events = [await nextText(reader), await nextText(reader), await nextText(reader)].join(
      "",
    );
    await reader.cancel();

    expect(events).toContain(": heartbeat");
    expect(events).toContain("event: notification");
    expect(events).toContain("event: operations");
    expect(mocks.getNotificationFeedForScope).toHaveBeenCalledTimes(2);
    expect(mocks.readOperationSnapshot).toHaveBeenCalledTimes(2);
  });

  it("reports unconfigured Redis once and polls both snapshots server-side", async () => {
    mocks.notificationRealtimeRedisConfigured.mockReturnValue(false);
    const response = await GET(streamRequest());
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Expected response body.");
    const chunks = [];
    for (let index = 0; index < 5; index += 1) chunks.push(await nextText(reader));

    expect(chunks.join("").match(/event: degraded/g)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4_000);
    await reader.cancel();

    expect(mocks.getNotificationFeedForScope).toHaveBeenCalledTimes(2);
    expect(mocks.readOperationSnapshot).toHaveBeenCalledTimes(2);
  });

  it("stops degraded polling when subscribers become ready after the timeout", async () => {
    let resolveReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    mocks.subscribeToNotificationEvents.mockReturnValue({ close: vi.fn(), ready });
    mocks.subscribeToOperationEvents.mockReturnValue({ close: vi.fn(), ready });

    const response = await GET(streamRequest());
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Expected response body.");
    for (let index = 0; index < 4; index += 1) await nextText(reader);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(vi.getTimerCount()).toBe(3);

    resolveReady();
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.getTimerCount()).toBe(2);
    await reader.cancel();
  });
});
