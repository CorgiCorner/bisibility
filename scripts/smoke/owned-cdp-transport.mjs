import { ownedCdpPolicy } from "./owned-cdp-policy.mjs";

/**
 * CDP attachment boundary. Playwright's noDefaults still initializes every
 * auto-attached personal page, so root auto-attach must never reach Opera.
 * Discovering targets is read-only; only newly created contexts are attached.
 */
export function ownedCdpTransport(wire) {
  const contexts = new Set();
  const targets = new Map();
  const sessions = new Map();
  const windows = new Map();
  const retired = new Set();
  const retiredSessions = new Set();
  const downloads = new Set();
  const frames = new Map();
  const browserSessions = new Set();
  const pending = new Map();
  const requests = new Map();
  const creatingPages = new Map();
  const attaching = new Set();
  let nextId = -1;
  let closed = false;
  const emit = (message) => transport.onmessage?.(message);
  const isOwned = (targetId) => targets.has(targetId) && !retired.has(targetId);
  const fail = (message) => {
    queueMicrotask(() =>
      emit({
        id: message.id,
        ...(message.sessionId ? { sessionId: message.sessionId } : {}),
        error: { code: -32000, message: "CDP operation is outside the owned test contexts." },
      }),
    );
  };
  const retireTarget = (targetId) => {
    retired.add(targetId);
    for (const [sessionId, target] of sessions) {
      if (target === targetId) retiredSessions.add(sessionId);
    }
    attaching.delete(targetId);
    const page = creatingPages.get(targetId);
    if (page) {
      creatingPages.delete(targetId);
      emit({
        id: page.id,
        error: { code: -32000, message: "Owned target closed before attachment." },
      });
    }
    for (const [windowId, owners] of windows) {
      owners.delete(targetId);
      if (owners.size === 0) windows.delete(windowId);
    }
  };
  const retireContext = (contextId) => {
    contexts.delete(contextId);
    for (const [targetId, context] of targets) {
      if (context === contextId) retireTarget(targetId);
    }
  };
  const internal = (method, params, done, sessionId) => {
    const id = nextId--;
    pending.set(id, done);
    wire.send({ id, method, params, ...(sessionId ? { sessionId } : {}) });
  };
  const releasePage = (targetId) => {
    const response = creatingPages.get(targetId);
    if (response && retired.has(targetId)) {
      retireTarget(targetId);
    } else if (response && isOwned(targetId) && [...sessions.values()].includes(targetId)) {
      creatingPages.delete(targetId);
      emit(response);
    }
  };
  const attach = (info) => {
    if (
      !["page", "service_worker"].includes(info.type) ||
      !contexts.has(info.browserContextId) ||
      attaching.has(info.targetId) ||
      retired.has(info.targetId)
    )
      return;
    targets.set(info.targetId, info.browserContextId);
    attaching.add(info.targetId);
    internal("Target.attachToTarget", { targetId: info.targetId, flatten: true }, (message) => {
      if (message.error) retireTarget(info.targetId);
    });
  };
  const transport = {
    onmessage: undefined,
    onclose: undefined,
    send(message) {
      if (closed) throw new Error("The test CDP transport is closed.");
      const policy = ownedCdpPolicy(message, {
        contexts,
        sessions,
        windows,
        browserSessions,
        retiredSessions,
        isOwned,
      });
      if (!policy) return fail(message);
      if (policy === "discover") {
        internal("Target.setDiscoverTargets", { discover: true }, (response) => {
          emit({
            id: message.id,
            ...(message.sessionId ? { sessionId: message.sessionId } : {}),
            ...(response.error ? { error: response.error } : { result: {} }),
          });
        });
        return;
      }
      requests.set(message.id, message);
      wire.send(message);
    },
    close() {
      if (closed) return;
      closed = true;
      wire.close();
    },
  };
  wire.onmessage = (message) => {
    if (closed) return;
    if (pending.has(message.id)) {
      const done = pending.get(message.id);
      pending.delete(message.id);
      done(message);
      return;
    }
    if (message.id !== undefined) {
      const request = requests.get(message.id);
      requests.delete(message.id);
      if (!request) return;
      if (
        !message.error &&
        request.method === "Page.getFrameTree" &&
        isOwned(sessions.get(request.sessionId))
      ) {
        const visit = (tree) => {
          if (!tree) return;
          frames.set(tree.frame.id, sessions.get(request.sessionId));
          for (const child of tree.childFrames ?? []) visit(child);
        };
        visit(message.result.frameTree);
      }
      if (!message.error && request.method === "Browser.getWindowForTarget") {
        const targetId = request.params?.targetId ?? sessions.get(request.sessionId);
        if (isOwned(targetId) && Number.isInteger(message.result.windowId)) {
          const owners = windows.get(message.result.windowId) ?? new Set();
          owners.add(targetId);
          windows.set(message.result.windowId, owners);
        }
      }
      if (!message.error && request.method === "Target.disposeBrowserContext") {
        retireContext(request.params.browserContextId);
      }
      if (!message.error && request.method === "Target.closeTarget" && message.result.success) {
        retireTarget(request.params.targetId);
      }
      if (!message.error && request.method === "Target.attachToBrowserTarget") {
        browserSessions.add(message.result.sessionId);
      }
      if (!message.error && request.method === "Target.createBrowserContext") {
        contexts.add(message.result.browserContextId);
      }
      if (!message.error && request.method === "Target.createTarget") {
        const targetId = message.result.targetId;
        if (!contexts.has(request.params.browserContextId)) retired.add(targetId);
        else if (!targets.has(targetId)) targets.set(targetId, request.params.browserContextId);
        creatingPages.set(targetId, message);
        releasePage(message.result.targetId);
        return;
      }
      emit(message);
      return;
    }
    if (message.method === "Target.targetCreated") {
      attach(message.params.targetInfo);
      return;
    }
    if (message.method === "Target.attachedToTarget") {
      const { targetInfo, sessionId } = message.params;
      const parentTarget = retiredSessions.has(message.sessionId)
        ? undefined
        : sessions.get(message.sessionId);
      const parentContext = targets.get(parentTarget);
      const contextId = targetInfo.browserContextId ?? parentContext;
      const parentAllowed =
        !message.sessionId || browserSessions.has(message.sessionId) || isOwned(parentTarget);
      const matchesParent =
        !parentContext || !targetInfo.browserContextId || parentContext === contextId;
      // An OOPIF process swap reuses its frame token after targetDestroyed.
      // A live owned parent can establish a new session; stale sessions stay fenced.
      const reattachedFrame =
        targetInfo.type === "iframe" &&
        isOwned(parentTarget) &&
        targets.get(targetInfo.targetId) === contextId;
      if (
        !contexts.has(contextId) ||
        !parentAllowed ||
        !matchesParent ||
        (retired.has(targetInfo.targetId) && !reattachedFrame)
      ) {
        if (contexts.has(contextId) || [...targets.values()].includes(contextId))
          internal("Target.detachFromTarget", { sessionId }, () => {}, message.sessionId);
        return;
      }
      retired.delete(targetInfo.targetId);
      targets.set(targetInfo.targetId, contextId);
      sessions.set(sessionId, targetInfo.targetId);
      emit(message);
      releasePage(targetInfo.targetId);
      return;
    }
    if (
      message.method === "Target.targetDestroyed" &&
      (targets.has(message.params.targetId) || attaching.has(message.params.targetId))
    ) {
      retireTarget(message.params.targetId);
      emit(message);
      return;
    }
    if (message.method === "Target.detachedFromTarget" && sessions.has(message.params.sessionId)) {
      const targetId = sessions.get(message.params.sessionId);
      sessions.delete(message.params.sessionId);
      retiredSessions.delete(message.params.sessionId);
      if (![...sessions.values()].includes(targetId)) {
        for (const [windowId, owners] of windows) {
          owners.delete(targetId);
          if (!owners.size) windows.delete(windowId);
        }
        attaching.delete(targetId);
      }
      emit(message);
      return;
    }
    if (
      message.method === "Browser.downloadWillBegin" &&
      (isOwned(message.params.frameId) || isOwned(frames.get(message.params.frameId)))
    ) {
      downloads.add(message.params.guid);
      emit(message);
    } else if (
      message.method === "Browser.downloadProgress" &&
      downloads.has(message.params.guid)
    ) {
      emit(message);
      if (message.params.state !== "inProgress") downloads.delete(message.params.guid);
    } else if (message.sessionId && sessions.has(message.sessionId)) {
      const frameId = message.params?.frame?.id ?? message.params?.frameId;
      if (frameId && ["Page.frameAttached", "Page.frameNavigated"].includes(message.method))
        frames.set(frameId, sessions.get(message.sessionId));
      if (message.method === "Page.frameDetached") frames.delete(frameId);
      emit(message);
    }
  };
  wire.onclose = (reason) => {
    closed = true;
    for (const collection of [
      contexts,
      targets,
      sessions,
      windows,
      retired,
      retiredSessions,
      downloads,
      frames,
      browserSessions,
      pending,
      requests,
      creatingPages,
      attaching,
    ])
      collection.clear();
    transport.onclose?.(reason);
  };
  return transport;
}
