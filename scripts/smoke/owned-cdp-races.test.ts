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
  receive({
    method: "Target.attachedToTarget",
    params: {
      targetInfo: { targetId: "page", browserContextId: "owned", type: "page" },
      sessionId: "page-session",
    },
  });
  const child = (sessionId: string) => ({
    method: "Target.attachedToTarget",
    sessionId: "page-session",
    params: {
      targetInfo: { targetId: "frame", browserContextId: "owned", type: "iframe" },
      sessionId,
      waitingForDebugger: true,
    },
  });
  return { wire, transport, received, receive, child };
}

describe("owned protocol races", () => {
  it("accepts an owned iframe re-attach after a navigation detach", () => {
    const f = fixture();
    f.receive(f.child("first"));
    f.receive({
      method: "Target.detachedFromTarget",
      sessionId: "page-session",
      params: { sessionId: "first", targetId: "frame" },
    });
    const reattached = f.child("second");
    f.receive(reattached);
    expect(f.received).toHaveBeenCalledWith(reattached);
  });

  it("re-attaches a process-swapped iframe without restoring the old session", async () => {
    const f = fixture();
    f.receive(f.child("first"));
    f.receive({ method: "Target.targetDestroyed", params: { targetId: "frame" } });
    const reattached = f.child("second");
    f.receive(reattached);
    expect(f.received).toHaveBeenCalledWith(reattached);
    f.wire.send.mockClear();
    f.transport.send({ id: 9, method: "Runtime.enable", sessionId: "first" });
    await Promise.resolve();
    expect(f.wire.send).not.toHaveBeenCalled();
    expect(f.received).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9, error: expect.any(Object) }),
    );
    f.transport.send({ id: 10, method: "Runtime.enable", sessionId: "second" });
    expect(f.wire.send).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
  });

  it.each(["iframe", "worker", "shared_worker", "other"])(
    "does not root-attach discovered %s targets",
    (type) => {
      const f = fixture();
      f.wire.send.mockClear();
      f.receive({
        method: "Target.targetCreated",
        params: { targetInfo: { targetId: "child", browserContextId: "owned", type } },
      });
      expect(f.wire.send).not.toHaveBeenCalled();
    },
  );

  it("rejects a late child under a disposed parent and detaches its owned session", async () => {
    const f = fixture();
    f.transport.send({
      id: 2,
      method: "Target.disposeBrowserContext",
      params: { browserContextId: "owned" },
    });
    f.receive({ id: 2, result: {} });
    f.received.mockClear();
    f.wire.send.mockClear();
    f.receive(f.child("late"));
    expect(f.received).not.toHaveBeenCalled();
    expect(f.wire.send).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "Target.detachFromTarget",
        sessionId: "page-session",
        params: { sessionId: "late" },
      }),
    );
    f.transport.send({ id: 3, method: "Runtime.enable", sessionId: "late" });
    await Promise.resolve();
    expect(f.received).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, error: expect.any(Object) }),
    );
  });

  it("does not inherit authority for a child naming a foreign context", () => {
    const f = fixture();
    const child = f.child("foreign");
    child.params.targetInfo.browserContextId = "personal";
    f.received.mockClear();
    f.wire.send.mockClear();
    f.receive(child);
    expect(f.received).not.toHaveBeenCalled();
    expect(f.wire.send).not.toHaveBeenCalled();
  });

  it("tracks downloads from pre-existing nested frames in a frame-tree reply", () => {
    const f = fixture();
    f.transport.send({ id: 4, method: "Page.getFrameTree", sessionId: "page-session" });
    f.receive({
      id: 4,
      sessionId: "page-session",
      result: { frameTree: { frame: { id: "page" }, childFrames: [{ frame: { id: "nested" } }] } },
    });
    const event = {
      method: "Browser.downloadWillBegin",
      params: { frameId: "nested", guid: "download" },
    };
    f.receive(event);
    expect(f.received).toHaveBeenCalledWith(event);
  });

  it("permits reducing access by detaching a retired session", () => {
    const f = fixture();
    f.receive({ method: "Target.targetDestroyed", params: { targetId: "page" } });
    f.wire.send.mockClear();
    const command = {
      id: 5,
      method: "Target.detachFromTarget",
      params: { sessionId: "page-session" },
    };
    f.transport.send(command);
    expect(f.wire.send).toHaveBeenCalledWith(command);
  });
});
