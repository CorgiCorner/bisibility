const pageDomains = new Set([
  "Accessibility",
  "CSS",
  "DOM",
  "DOMDebugger",
  "DOMSnapshot",
  "Debugger",
  "Emulation",
  "Fetch",
  "Input",
  "Log",
  "Network",
  "Overlay",
  "Page",
  "Performance",
  "Profiler",
  "Runtime",
  "Security",
]);
const contextMethods = new Set([
  "Target.createTarget",
  "Target.disposeBrowserContext",
  "Browser.setDownloadBehavior",
  "Browser.grantPermissions",
  "Browser.resetPermissions",
  "Browser.cancelDownload",
  "Storage.getCookies",
  "Storage.setCookies",
  "Storage.clearCookies",
]);
const targetMethods = new Set([
  "Target.closeTarget",
  "Target.attachToTarget",
  "Browser.getWindowForTarget",
]);

export function ownedCdpPolicy(
  message,
  { contexts, sessions, windows, browserSessions, retiredSessions, isOwned },
) {
  const { method, params = {}, sessionId } = message;
  const detach = method === "Target.detachFromTarget" && sessions.has(params.sessionId);
  if (method === "Browser.close") return false;
  const pageSession = !retiredSessions.has(sessionId) && isOwned(sessions.get(sessionId));
  if (sessionId && !pageSession && !browserSessions.has(sessionId)) {
    return sessions.has(sessionId) && detach;
  }
  if (!pageSession && method === "Target.setAutoAttach") return "discover";
  const pageCommand =
    pageSession &&
    pageDomains.has(method.split(".")[0]) &&
    method !== "Network.clearBrowserCookies" &&
    method !== "Network.clearBrowserCache";
  const readOnly =
    method === "Target.attachToBrowserTarget" ||
    method === "Browser.getVersion" ||
    (method === "Target.getTargetInfo" && (!params.targetId || isOwned(params.targetId)));
  const ownWindow =
    (method === "Browser.getWindowForTarget" &&
      (params.targetId ? isOwned(params.targetId) : pageSession)) ||
    (method === "Browser.setWindowBounds" && windows.has(params.windowId));
  return (
    pageCommand ||
    readOnly ||
    ownWindow ||
    detach ||
    (pageSession && method === "Target.setAutoAttach") ||
    (method === "Target.createBrowserContext" && params.disposeOnDetach === true) ||
    (contexts.has(params.browserContextId) && contextMethods.has(method)) ||
    (isOwned(params.targetId) && targetMethods.has(method))
  );
}
