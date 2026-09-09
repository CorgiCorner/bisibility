"use server";

import {
  analyticsConsentValuesSchema,
  CONSENT_COOKIE,
  CONSENT_VERSION,
  type ConsentState,
  consentCookieOptions,
  serializeConsentCookie,
} from "@/lib/analytics/consent";
import { trackServerEvent } from "@/lib/analytics/server";
import { cookies } from "next/headers";

export async function saveAnalyticsConsent(values: unknown): Promise<ConsentState> {
  const parsed = analyticsConsentValuesSchema.parse(values);
  const consent: ConsentState = {
    ...parsed,
    decidedAt: Math.floor(Date.now() / 1000),
    status: "decided",
  };
  const store = await cookies();
  store.set(CONSENT_COOKIE, serializeConsentCookie(consent), consentCookieOptions());
  await trackServerEvent("consent_updated", {
    consent,
    properties: { ...parsed, version: CONSENT_VERSION },
  });
  return consent;
}
