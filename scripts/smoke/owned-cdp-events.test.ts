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
  const received = vi.fn();
  transport.onmessage = received;
  const receive = (message: object) => wire.onmessage(message);
  transport.send({
    id: 1,
    method: "Target.createBrowserContext",
    params: { disposeOnDetach: true },
  });
  receive({ id: 1, result: { browserContextId: "owned" } });
  const targetInfo = { targetId: "page", browserContextId: "owned", type: "page" };
  receive({ method: "Target.attachedToTarget", params: { targetInfo, sessionId: "page-session" } });
  return { transport, wire, received, receive, targetInfo };
}

describe("owned CDP lifecycle events", () => {
  it.each(["close", "context", "destroy"])(
    "forwards detach after %s revokes authorization",
    async (kind) => {
      const f = fixture();
      if (kind === "destroy")
        f.receive({ method: "Target.targetDestroyed", params: { targetId: "page" } });
      else {
        f.transport.send({
          id: 2,
          method: kind === "close" ? "Target.closeTarget" : "Target.disposeBrowserContext",
          params: kind === "close" ? { targetId: "page" } : { browserContextId: "owned" },
        });
        f.receive({ id: 2, result: { success: true } });
      }
      const detach = {
        method: "Target.detachedFromTarget",
        params: { targetId: "page", sessionId: "page-session" },
      };
      f.receive(detach);
      expect(f.received).toHaveBeenCalledWith(detach);
      f.transport.send({ id: 3, method: "Runtime.enable", sessionId: "page-session" });
      await Promise.resolve();
      expect(f.received).toHaveBeenCalledWith(
        expect.objectContaining({ id: 3, error: expect.any(Object) }),
      );
      expect(f.wire.close).not.toHaveBeenCalled();
    },
  );

  it("forwards only owned downloads and their completion events", () => {
    const f = fixture();
    const begin = {
      method: "Browser.downloadWillBegin",
      params: { frameId: "page", guid: "own", url: "http://local/file" },
    };
    const end = { method: "Browser.downloadProgress", params: { guid: "own", state: "completed" } };
    f.receive(begin);
    f.receive(end);
    expect(f.received).toHaveBeenCalledWith(begin);
    expect(f.received).toHaveBeenCalledWith(end);
    f.received.mockClear();
    f.receive({
      method: "Browser.downloadWillBegin",
      params: { frameId: "personal", guid: "foreign" },
    });
    f.receive({
      method: "Browser.downloadProgress",
      params: { guid: "foreign", state: "completed" },
    });
    f.receive(end);
    expect(f.received).not.toHaveBeenCalled();
  });

  it.each(["attach", "destroy"])(
    "settles a held page on %s failure without disconnecting others",
    (kind) => {
      const f = fixture();
      f.transport.send({
        id: 5,
        method: "Target.createTarget",
        params: { browserContextId: "owned", url: "about:blank" },
      });
      f.receive({ id: 5, result: { targetId: "new" } });
      f.receive({
        method: "Target.targetCreated",
        params: { targetInfo: { ...f.targetInfo, targetId: "new" } },
      });
      if (kind === "attach")
        f.receive({
          id: f.wire.send.mock.calls.at(-1)![0].id,
          error: { code: -32602, message: "No target with given id found" },
        });
      else f.receive({ method: "Target.targetDestroyed", params: { targetId: "new" } });
      expect(f.received).toHaveBeenCalledWith(
        expect.objectContaining({ id: 5, error: expect.any(Object) }),
      );
      expect(f.wire.close).not.toHaveBeenCalled();
    },
  );
  it.each(["before", "after"])(
    "settles a createTarget reply arriving %s context disposal",
    (order) => {
      const f = fixture();
      f.transport.send({
        id: 8,
        method: "Target.createTarget",
        params: { browserContextId: "owned", url: "about:blank" },
      });
      if (order === "before") f.receive({ id: 8, result: { targetId: "pending" } });
      f.transport.send({
        id: 9,
        method: "Target.disposeBrowserContext",
        params: { browserContextId: "owned" },
      });
      f.receive({ id: 9, result: {} });
      if (order === "after") f.receive({ id: 8, result: { targetId: "pending" } });
      expect(f.received).toHaveBeenCalledWith(
        expect.objectContaining({ id: 8, error: expect.any(Object) }),
      );
      expect(f.wire.close).not.toHaveBeenCalled();
    },
  );
});
