"use client";

export const AUTH_SESSION_END_EVENT = "bisibility:auth-session-end";
const AUTH_SESSION_END_CHANNEL = "bisibility:auth-session";
const AUTH_SESSION_END_MESSAGE = "session-end";

function broadcastSessionEnd() {
  if (typeof BroadcastChannel === "undefined") return;

  try {
    const channel = new BroadcastChannel(AUTH_SESSION_END_CHANNEL);
    channel.postMessage(AUTH_SESSION_END_MESSAGE);
    channel.close();
  } catch {
    // Browser storage restrictions must not block the local shutdown signal.
  }
}

/** Announces a confirmed local sign-out to authenticated browser integrations. */
export function notifyAuthenticatedSessionEnd() {
  window.dispatchEvent(new Event(AUTH_SESSION_END_EVENT));
  broadcastSessionEnd();
}

/** Subscribes an integration to local and sibling-tab session-end notifications. */
export function subscribeAuthenticatedSessionEnd(listener: () => void) {
  window.addEventListener(AUTH_SESSION_END_EVENT, listener);
  let channel: BroadcastChannel | null = null;

  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(AUTH_SESSION_END_CHANNEL);
      channel.onmessage = ({ data }) => {
        if (data === AUTH_SESSION_END_MESSAGE) {
          window.dispatchEvent(new Event(AUTH_SESSION_END_EVENT));
        }
      };
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener(AUTH_SESSION_END_EVENT, listener);
    channel?.close();
  };
}
