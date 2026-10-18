"use server";

import { saveAccountAnalyticsConsent } from "@/lib/analytics/account-consent";
import {
  analyticsConsentValuesSchema,
  CONSENT_ACCOUNT_COOKIE,
  CONSENT_COOKIE,
  CONSENT_VERSION,
  type ConsentState,
  consentCookieOptions,
  consentPromptContextSchema,
  parseConsentCookie,
  pendingConsent,
  serializeConsentCookie,
} from "@/lib/analytics/consent";
import { trackServerEvent } from "@/lib/analytics/server";
import { resolveServerAnalyticsUser } from "@/lib/analytics/server-user";
import { reconcileWebConsent } from "@/lib/analytics/web-consent";
import { getOptionalAvailableSession as getSession } from "@/lib/auth/session";
import { cookies } from "next/headers";

export async function saveAnalyticsConsent(
  values: unknown,
  promptContext?: unknown,
): Promise<ConsentState> {
  const parsed = analyticsConsentValuesSchema.parse(values);
  const context = consentPromptContextSchema.safeParse(promptContext);
  const decidedAt = Math.floor(Date.now() / 1000);
  const consent: ConsentState = {
    ...parsed,
    decidedAt,
    status: "decided",
  };
  const store = await cookies();
  const session = await getSession();
  if (session) {
    await saveAccountAnalyticsConsent(
      session.user.id,
      consent.analytics,
      "web",
      new Date(decidedAt * 1000),
      { authKind: "session" },
      true,
    );
    const user = await resolveServerAnalyticsUser(session.user.id, consent);
    if (user)
      store.set(
        CONSENT_ACCOUNT_COOKIE,
        user.distinctId,
        consentCookieOptions(process.env.NODE_ENV, consent),
      );
  } else {
    store.delete(CONSENT_ACCOUNT_COOKIE);
  }
  store.set(
    CONSENT_COOKIE,
    serializeConsentCookie(consent),
    consentCookieOptions(process.env.NODE_ENV, consent),
  );
  await trackServerEvent("consent_updated", {
    consent,
    properties: {
      ...parsed,
      version: CONSENT_VERSION,
      ...(context.success
        ? {
            prompt_variant: context.data.variant,
            decision_source: context.data.source,
            decision_ms: context.data.decision_ms,
          }
        : {}),
    },
  });
  return consent;
}

export async function syncAccountAnalyticsConsent(expectedPublicId: string): Promise<ConsentState> {
  const session = await getSession();
  const store = await cookies();
  const raw = store.get(CONSENT_COOKIE)?.value;
  const browser = parseConsentCookie(raw);
  if (!session) return pendingConsent();
  const user = await resolveServerAnalyticsUser(session.user.id, browser);
  if (!user || user.distinctId !== expectedPublicId) return pendingConsent();
  const owner = store.get(CONSENT_ACCOUNT_COOKIE)?.value;
  return reconcileWebConsent(
    session.user.id,
    owner && owner !== user.distinctId ? pendingConsent() : browser,
  );
}
