import { applyAnalyticsConsent, setAnalyticsReplay } from "./client";
import {
  type AnalyticsConsentValues,
  CONSENT_COOKIE,
  type ConsentState,
  consentCookieOptions,
  parseConsentCookie,
  serializeConsentCookie,
} from "./consent";

export function readBrowserConsent(fallback: ConsentState): ConsentState {
  const raw = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
    ?.split("=")[1];
  return raw ? parseConsentCookie(raw) : fallback;
}

export function restrictConsentImmediately(values: AnalyticsConsentValues): void {
  const current = readBrowserConsent({
    analytics: false,
    replay: false,
    status: "pending",
    decidedAt: null,
  });
  const restricted: ConsentState = {
    analytics: current.analytics && values.analytics,
    replay: current.replay && values.replay,
    decidedAt: Math.floor(Date.now() / 1000),
    status: "decided",
  };
  const options = consentCookieOptions();
  document.cookie = `${CONSENT_COOKIE}=${serializeConsentCookie(restricted)}; Path=/; Max-Age=${options.maxAge}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  applyAnalyticsConsent(restricted);
  setAnalyticsReplay(restricted.replay);
}
