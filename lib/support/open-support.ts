"use client";

/**
 * Asks the deployment's in-app support channel to open. Builds without one ignore it, so
 * callers show the entry point only when the server reported support as available.
 */
const OPEN_SUPPORT_EVENT = "bisibility:open-support";

export type OpenSupportRequest = Readonly<{ message?: string }>;

export function openSupport(request: OpenSupportRequest = {}) {
  window.dispatchEvent(
    new CustomEvent<OpenSupportRequest>(OPEN_SUPPORT_EVENT, { detail: request }),
  );
}

export function subscribeOpenSupport(listener: (request: OpenSupportRequest) => void) {
  const handle = (event: Event) =>
    listener((event as CustomEvent<OpenSupportRequest>).detail ?? {});
  window.addEventListener(OPEN_SUPPORT_EVENT, handle);
  return () => window.removeEventListener(OPEN_SUPPORT_EVENT, handle);
}
