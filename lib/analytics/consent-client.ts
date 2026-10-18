import { applyAnalyticsConsent, readAppliedAnalyticsConsent, setAnalyticsReplay } from "./client";
import {
  type AnalyticsConsentValues,
  CONSENT_COOKIE,
  type ConsentState,
  consentCookieOptions,
  parseConsentCookie,
  serializeConsentCookie,
} from "./consent";

let consentRevision = 0;

export function readConsentRevision(): number {
  return consentRevision;
}

export function readBrowserConsent(fallback: ConsentState): ConsentState {
  const raw = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
    ?.split("=")[1];
  return raw ? parseConsentCookie(raw) : fallback;
}

export function restrictConsentImmediately(values: AnalyticsConsentValues): void {
  consentRevision += 1;
  const current = readBrowserConsent({
    analytics: false,
    replay: false,
    status: "pending",
    decidedAt: null,
  });
  const applied = readAppliedAnalyticsConsent();
  const analytics = current.analytics && Boolean(applied?.analytics) && values.analytics;
  const replay = current.replay && values.replay;
  const analyticsNeedsDecision = Boolean(
    values.analytics &&
      (current.status === "pending" ||
        current.analyticsNeedsDecision ||
        (current.analytics && !applied?.analytics)),
  );
  const pending = analyticsNeedsDecision && !replay;
  const restricted: ConsentState = {
    analytics,
    replay,
    decidedAt: pending
      ? null
      : values.analytics
        ? current.decidedAt
        : Math.floor(Date.now() / 1000),
    status: pending ? "pending" : "decided",
    ...(analyticsNeedsDecision ? { analyticsNeedsDecision: true } : {}),
  };
  const options = consentCookieOptions(process.env.NODE_ENV, restricted);
  const value =
    restricted.status === "pending"
      ? "; Path=/; Max-Age=0; SameSite=Lax"
      : `${serializeConsentCookie(restricted)}; Path=/; Max-Age=${options.maxAge}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  if (
    !values.analytics ||
    analytics !== current.analytics ||
    replay !== current.replay ||
    analyticsNeedsDecision !== Boolean(current.analyticsNeedsDecision)
  ) {
    // biome-ignore lint/suspicious/noDocumentCookie: Restrict permission without turning a failed grant into a new decision.
    document.cookie = `${CONSENT_COOKIE}=${value}`;
  }
  applyAnalyticsConsent(restricted);
  setAnalyticsReplay(restricted.replay);
}
