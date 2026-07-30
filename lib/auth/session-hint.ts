const SESSION_HINT_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Non-httpOnly session-presence mirror used only to avoid navigation paint flashes.
 */
export const SESSION_HINT_COOKIE = "bv_session_hint";

export const SESSION_HINT_COOKIE_OPTIONS = {
  httpOnly: false,
  maxAge: SESSION_HINT_MAX_AGE,
  path: "/",
  sameSite: "lax",
} as const;

// This function is serialized into an inline pre-paint script below. Keep it
// self-contained: module-scope helpers and constants do not exist in that script.
export function initializeSessionHintFromCookie() {
  const authed = document.cookie
    .split(";")
    .some((entry) => entry.trim().startsWith("bv_session_hint=1"));

  if (authed) {
    document.documentElement.dataset.authed = "true";
  } else {
    delete document.documentElement.dataset.authed;
  }
}

export const sessionHintInitScript = `(${initializeSessionHintFromCookie.toString()})();`;
