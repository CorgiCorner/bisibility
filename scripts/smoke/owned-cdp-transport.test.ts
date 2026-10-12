import { chromium } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { ownedCdpTransport } from "./owned-cdp-transport.mjs";

function fixture() {
  const wire = {
    send: vi.fn(),
    close: vi.fn(),
    onmessage: undefined as any,
    onclose: undefined as any,
  };
  const transport = ownedCdpTransport(wire);
  const receive = vi.fn();
  transport.onmessage = receive;
  const respond = (message: object) => wire.onmessage(message);
  const sent = () => wire.send.mock.calls.at(-1)![0];
  const ownContext = () => {
    transport.send({
      id: 20,
      method: "Target.createBrowserContext",
      params: { disposeOnDetach: true },
    });
    respond({ id: 20, result: { browserContextId: "owned" } });
  };
  return { wire, transport, receive, respond, sent, ownContext };
}

describe("owned-context CDP protocol boundary", async () => {
  it("connects the real native library without initializing a pre-existing page", async () => {
    const methods: string[] = [];
    const wire = {
      onmessage: undefined as ((message: object) => void) | undefined,
      onclose: undefined as (() => void) | undefined,
      send(message: { id: number; method: string }) {
        methods.push(message.method);
        const result =
          message.method === "Browser.getVersion"
            ? {
                product: "Chrome/152.0.0.0",
                userAgent: "OPR/136",
                revision: "fixture",
                jsVersion: "1",
                protocolVersion: "1.3",
              }
            : message.method === "Target.getTargetInfo"
              ? { targetInfo: { targetId: "browser", type: "browser", url: "", attached: true } }
              : {};
        queueMicrotask(() => wire.onmessage?.({ id: message.id, result }));
        if (message.method === "Target.setDiscoverTargets") {
          queueMicrotask(() =>
            wire.onmessage?.({
              method: "Target.targetCreated",
              params: {
                targetInfo: { targetId: "personal", browserContextId: "default", type: "page" },
              },
            }),
          );
        }
      },
      close() {
        queueMicrotask(() => wire.onclose?.());
      },
    };
    const transport = ownedCdpTransport(wire);
    try {
      await chromium.connectOverCDP(transport, { noDefaults: true, timeout: 3_000 });
      expect(methods).toEqual([
        "Browser.getVersion",
        "Target.setDiscoverTargets",
        "Target.getTargetInfo",
      ]);
    } finally {
      transport.close();
    }
  });

  it("replaces root auto-attach with readonly discovery and never attaches personal pages", async () => {
    const f = fixture();
    f.transport.send({
      id: 1,
      method: "Target.setAutoAttach",
      params: { autoAttach: true, waitForDebuggerOnStart: true },
    });
    expect(f.sent()).toMatchObject({
      method: "Target.setDiscoverTargets",
      params: { discover: true },
    });
    f.respond({ id: f.sent().id, result: {} });
    expect(f.receive).toHaveBeenCalledWith({ id: 1, result: {} });
    f.respond({
      method: "Target.targetCreated",
      params: { targetInfo: { targetId: "personal", browserContextId: "default", type: "page" } },
    });
    expect(f.wire.send).toHaveBeenCalledOnce();
    expect(f.receive).toHaveBeenCalledOnce();
  });

  it("holds createTarget until the owned page is attached, and forwards only owned sessions", async () => {
    const f = fixture();
    f.ownContext();
    f.transport.send({
      id: 21,
      method: "Target.createTarget",
      params: { browserContextId: "owned", url: "about:blank" },
    });
    f.respond({ id: 21, result: { targetId: "page" } });
    expect(f.receive).toHaveBeenCalledTimes(1);
    const targetInfo = { targetId: "page", browserContextId: "owned", type: "page" };
    f.respond({ method: "Target.targetCreated", params: { targetInfo } });
    expect(f.sent()).toMatchObject({
      method: "Target.attachToTarget",
      params: { targetId: "page", flatten: true },
    });
    f.respond({
      method: "Target.attachedToTarget",
      params: { targetInfo, sessionId: "owned-session", waitingForDebugger: false },
    });
    expect(f.receive.mock.calls.slice(-2).map(([m]) => m.method ?? m.id)).toEqual([
      "Target.attachedToTarget",
      21,
    ]);
    f.transport.send({
      id: 22,
      sessionId: "owned-session",
      method: "Input.dispatchMouseEvent",
      params: {},
    });
    expect(f.sent()).toMatchObject({ id: 22 });
    f.respond({ sessionId: "personal-session", method: "Runtime.consoleAPICalled", params: {} });
    expect(f.receive).toHaveBeenCalledTimes(3);
  });

  it.each([
    { method: "Browser.close" },
    { method: "Target.createTarget", params: { url: "about:blank" } },
    { method: "Target.closeTarget", params: { targetId: "personal" } },
    { method: "Storage.clearCookies", params: { browserContextId: "default" } },
    { method: "Runtime.evaluate", sessionId: "personal-session" },
  ])("fails closed for $method outside ownership", async (message) => {
    const f = fixture();
    f.transport.send({ id: 99, ...message });
    await Promise.resolve();
    expect(f.receive).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: expect.any(Object) }),
    );
    expect(f.wire.send).not.toHaveBeenCalled();
    expect(f.wire.close).not.toHaveBeenCalled();
  });

  it.each([
    { method: "Browser.crash" },
    { method: "Browser.setWindowBounds", params: { windowId: 999, bounds: { width: 1 } } },
    { method: "Browser.getWindowForTarget", params: { targetId: "personal" } },
    {
      method: "Browser.setDownloadBehavior",
      params: { browserContextId: "default", behavior: "deny" },
    },
    { method: "Target.createTarget", params: { url: "about:blank" } },
    { method: "Target.createTarget", params: { browserContextId: "default", url: "about:blank" } },
    { method: "Target.closeTarget", params: { targetId: "personal" } },
    { method: "Target.attachToTarget", params: { targetId: "personal", flatten: true } },
    { method: "Target.disposeBrowserContext", params: { browserContextId: "default" } },
    { method: "Storage.getCookies", params: { browserContextId: "default" } },
    { method: "Storage.setCookies", params: { browserContextId: "default", cookies: [] } },
    { method: "Storage.clearCookies", params: { browserContextId: "default" } },
  ])("still fences $method when addressed through an owned page session", async (message) => {
    const f = fixture();
    f.ownContext();
    f.respond({
      method: "Target.attachedToTarget",
      params: {
        targetInfo: { targetId: "page", browserContextId: "owned" },
        sessionId: "page-session",
      },
    });
    f.wire.send.mockClear();
    f.transport.send({ id: 100, sessionId: "page-session", ...message });
    await Promise.resolve();
    expect(f.receive).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: expect.any(Object) }),
    );
    expect(f.wire.send).not.toHaveBeenCalled();
    expect(f.wire.close).not.toHaveBeenCalled();
  });

  it("retains page commands, owned descendants and only a window proved by an owned target", async () => {
    const f = fixture();
    f.ownContext();
    f.respond({
      method: "Target.attachedToTarget",
      params: {
        targetInfo: { targetId: "page", browserContextId: "owned" },
        sessionId: "page-session",
      },
    });
    for (const [index, method] of [
      "Page.enable",
      "Runtime.enable",
      "Emulation.setDeviceMetricsOverride",
      "Network.enable",
      "Input.dispatchMouseEvent",
      "Target.setAutoAttach",
    ].entries()) {
      f.transport.send({ id: 101 + index, sessionId: "page-session", method });
      expect(f.sent()).toMatchObject({ method, sessionId: "page-session" });
    }
    f.transport.send({ id: 110, sessionId: "page-session", method: "Browser.getWindowForTarget" });
    f.respond({ id: 110, sessionId: "page-session", result: { windowId: 7 } });
    f.transport.send({
      id: 111,
      sessionId: "page-session",
      method: "Browser.setWindowBounds",
      params: { windowId: 7, bounds: { width: 1440 } },
    });
    expect(f.sent()).toMatchObject({ id: 111, params: { windowId: 7 } });
    f.transport.send({
      id: 112,
      sessionId: "page-session",
      method: "Storage.clearCookies",
      params: { browserContextId: "owned" },
    });
    f.transport.send({
      id: 113,
      sessionId: "page-session",
      method: "Target.closeTarget",
      params: { targetId: "page" },
    });
    expect(f.sent()).toMatchObject({ id: 113 });
    expect(f.wire.close).not.toHaveBeenCalled();
  });

  it.each(["target", "context", "session", "close"])(
    "retires window ownership after %s removal",
    async (removal) => {
      const f = fixture();
      f.ownContext();
      f.respond({
        method: "Target.attachedToTarget",
        params: {
          targetInfo: { targetId: "page", browserContextId: "owned" },
          sessionId: "page-session",
        },
      });
      f.transport.send({
        id: 200,
        sessionId: "page-session",
        method: "Browser.getWindowForTarget",
      });
      f.respond({ id: 200, sessionId: "page-session", result: { windowId: 7 } });
      if (removal === "target")
        f.respond({ method: "Target.targetDestroyed", params: { targetId: "page" } });
      if (removal === "session")
        f.respond({
          method: "Target.detachedFromTarget",
          params: { targetId: "page", sessionId: "page-session" },
        });
      if (removal === "context") {
        f.transport.send({
          id: 201,
          method: "Target.disposeBrowserContext",
          params: { browserContextId: "owned" },
        });
        f.respond({ id: 201, result: {} });
      }
      if (removal === "close") {
        f.transport.send({ id: 201, method: "Target.closeTarget", params: { targetId: "page" } });
        f.respond({ id: 201, result: { success: true } });
      }
      f.wire.send.mockClear();
      f.transport.send({
        id: 202,
        method: "Browser.setWindowBounds",
        params: { windowId: 7, bounds: { width: 1 } },
      });
      await Promise.resolve();
      expect(f.receive).toHaveBeenLastCalledWith(
        expect.objectContaining({ error: expect.any(Object) }),
      );
      expect(f.wire.send).not.toHaveBeenCalled();
    },
  );

  it("does not resurrect window ownership from a delayed query after target removal", async () => {
    const f = fixture();
    f.ownContext();
    f.respond({
      method: "Target.attachedToTarget",
      params: {
        targetInfo: { targetId: "page", browserContextId: "owned" },
        sessionId: "page-session",
      },
    });
    f.transport.send({ id: 210, sessionId: "page-session", method: "Browser.getWindowForTarget" });
    f.respond({ method: "Target.targetDestroyed", params: { targetId: "page" } });
    f.respond({ id: 210, sessionId: "page-session", result: { windowId: 7 } });
    f.transport.send({
      id: 211,
      method: "Browser.setWindowBounds",
      params: { windowId: 7, bounds: { width: 1 } },
    });
    await Promise.resolve();
    expect(f.receive).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: expect.any(Object) }),
    );
  });

  it("keeps a live target's window when only its extra CDP session detaches", async () => {
    const f = fixture();
    f.ownContext();
    for (const sessionId of ["page-session", "extra-session"])
      f.respond({
        method: "Target.attachedToTarget",
        params: {
          targetInfo: { targetId: "page", browserContextId: "owned" },
          sessionId,
        },
      });
    f.transport.send({ id: 220, sessionId: "page-session", method: "Browser.getWindowForTarget" });
    f.respond({ id: 220, sessionId: "page-session", result: { windowId: 7 } });
    f.respond({
      method: "Target.detachedFromTarget",
      params: { targetId: "page", sessionId: "extra-session" },
    });
    f.transport.send({
      id: 221,
      sessionId: "page-session",
      method: "Browser.setWindowBounds",
      params: { windowId: 7, bounds: { width: 1440 } },
    });
    expect(f.sent()).toMatchObject({ id: 221 });
    expect(f.wire.close).not.toHaveBeenCalled();
  });

  it("allows newCDPSession routing only to an owned target", async () => {
    const f = fixture();
    f.ownContext();
    f.respond({
      method: "Target.attachedToTarget",
      params: {
        targetInfo: { targetId: "page", browserContextId: "owned" },
        sessionId: "page-session",
      },
    });
    f.transport.send({ id: 40, method: "Target.attachToBrowserTarget" });
    f.respond({ id: 40, result: { sessionId: "routing-session" } });
    f.transport.send({
      id: 41,
      sessionId: "routing-session",
      method: "Target.attachToTarget",
      params: { targetId: "page", flatten: true },
    });
    expect(f.sent()).toMatchObject({
      id: 41,
      sessionId: "routing-session",
      params: { targetId: "page" },
    });
    f.transport.send({
      id: 42,
      sessionId: "routing-session",
      method: "Target.attachToTarget",
      params: { targetId: "personal" },
    });
    await Promise.resolve();
    expect(f.receive).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: expect.any(Object) }),
    );
  });

  it("retains nested targets, popups and scoped cookie and disposal commands", async () => {
    const f = fixture();
    f.ownContext();
    f.respond({
      method: "Target.attachedToTarget",
      params: {
        targetInfo: { targetId: "page", browserContextId: "owned" },
        sessionId: "page-session",
      },
    });
    f.respond({
      sessionId: "page-session",
      method: "Target.attachedToTarget",
      params: { targetInfo: { targetId: "frame" }, sessionId: "frame-session" },
    });
    f.transport.send({ id: 30, sessionId: "frame-session", method: "Runtime.enable" });
    f.respond({
      method: "Target.targetCreated",
      params: {
        targetInfo: {
          targetId: "popup",
          browserContextId: "owned",
          openerId: "page",
          type: "page",
        },
      },
    });
    expect(f.sent()).toMatchObject({
      method: "Target.attachToTarget",
      params: { targetId: "popup" },
    });
    f.transport.send({
      id: 31,
      method: "Storage.clearCookies",
      params: { browserContextId: "owned" },
    });
    f.transport.send({
      id: 32,
      method: "Target.disposeBrowserContext",
      params: { browserContextId: "owned" },
    });
    expect(f.sent()).toMatchObject({ id: 32 });
    expect(f.wire.close).not.toHaveBeenCalled();
  });
});
