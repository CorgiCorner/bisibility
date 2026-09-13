import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_SESSION_END_EVENT,
  notifyAuthenticatedSessionEnd,
  subscribeAuthenticatedSessionEnd,
} from "./session-end";

class TestBroadcastChannel {
  static instances: TestBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly close = vi.fn();
  readonly postMessage = vi.fn();

  constructor(readonly name: string) {
    TestBroadcastChannel.instances.push(this);
  }
}

afterEach(() => {
  TestBroadcastChannel.instances = [];
  vi.unstubAllGlobals();
});

describe("authenticated session-end notifications", () => {
  it("notifies this tab and broadcasts a non-secret session-end message", () => {
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    const listener = vi.fn();
    window.addEventListener(AUTH_SESSION_END_EVENT, listener);

    notifyAuthenticatedSessionEnd();

    expect(listener).toHaveBeenCalledOnce();
    expect(TestBroadcastChannel.instances).toHaveLength(1);
    expect(TestBroadcastChannel.instances[0]).toMatchObject({ name: "bisibility:auth-session" });
    expect(TestBroadcastChannel.instances[0].postMessage).toHaveBeenCalledWith("session-end");
    expect(TestBroadcastChannel.instances[0].close).toHaveBeenCalledOnce();
    window.removeEventListener(AUTH_SESSION_END_EVENT, listener);
  });

  it("forwards sibling-tab notifications and tears down the channel", () => {
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    const listener = vi.fn();
    const unsubscribe = subscribeAuthenticatedSessionEnd(listener);
    const channel = TestBroadcastChannel.instances[0];

    channel.onmessage?.(new MessageEvent("message", { data: "session-end" }));
    channel.onmessage?.(new MessageEvent("message", { data: { userId: "usr_not_allowed" } }));

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    expect(channel.close).toHaveBeenCalledOnce();
  });
});
