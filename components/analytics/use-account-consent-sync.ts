"use client";

import { syncAccountAnalyticsConsent } from "@/lib/actions/analytics-consent";
import {
  CONSENT_ACCOUNT_COOKIE,
  CONSENT_COOKIE,
  type ConsentState,
  consentCookieOptions,
  pendingConsent,
  serializeConsentCookie,
} from "@/lib/analytics/consent";
import { readBrowserConsent, readConsentRevision } from "@/lib/analytics/consent-client";
import type { AnalyticsProvider } from "@/lib/analytics/provider";
import { useLayoutEffect, useState } from "react";

function consentKey(consent: ConsentState) {
  return JSON.stringify([
    consent.status,
    consent.analytics,
    Boolean(consent.analyticsNeedsDecision),
    consent.replay,
    consent.decidedAt,
    Boolean(consent.replayNeedsDecision),
  ]);
}

export function useAccountConsentSync(
  provider: AnalyticsProvider,
  userId?: string,
  authenticated = Boolean(userId),
  route?: string,
) {
  const [resolved, setResolved] = useState<{
    userId: string;
    consent: ConsentState;
    revision: number;
    route?: string;
  }>();
  // Synchronize the authenticated browser with the account's external consent store.
  useLayoutEffect(() => {
    if (provider !== "posthog" || !userId) return;
    let active = true;
    const before = consentKey(readBrowserConsent(pendingConsent()));
    const revision = readConsentRevision();
    void syncAccountAnalyticsConsent(userId)
      .then((consent) => {
        if (!active) return;
        if (
          revision === readConsentRevision() &&
          before === consentKey(readBrowserConsent(pendingConsent()))
        ) {
          const options = consentCookieOptions(process.env.NODE_ENV, consent);
          const attributes = `Path=/; Max-Age=${options.maxAge}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
          const value =
            consent.status === "decided"
              ? `${serializeConsentCookie(consent)}; ${attributes}`
              : "; Path=/; Max-Age=0; SameSite=Lax";
          if (before !== consentKey(consent)) {
            // biome-ignore lint/suspicious/noDocumentCookie: Synchronize the explicit account decision with the existing browser consent cookie.
            document.cookie = `${CONSENT_COOKIE}=${value}`;
          }
          // biome-ignore lint/suspicious/noDocumentCookie: Bind this copied decision to its account to prevent cross-account seeding.
          document.cookie = `${CONSENT_ACCOUNT_COOKIE}=${userId}; ${attributes}`;
        }
        setResolved({ userId, consent, revision, route });
      })
      .catch(() => {
        // Keep product analytics off while account consent is unavailable.
      });
    return () => {
      active = false;
    };
  }, [provider, userId, route]);
  const rechecking = Boolean(
    authenticated &&
      userId &&
      resolved?.userId === userId &&
      resolved.route !== route &&
      resolved.revision === readConsentRevision(),
  );
  return {
    ...(rechecking ? { rechecking: true } : {}),
    ready:
      !authenticated || Boolean(userId && resolved?.userId === userId && resolved.route === route),
    consent:
      resolved &&
      resolved.userId === userId &&
      resolved.route === route &&
      resolved.revision === readConsentRevision()
        ? resolved.consent
        : undefined,
  };
}
