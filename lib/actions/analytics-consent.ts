"use server";

import {
  analyticsConsentValuesSchema,
  CONSENT_COOKIE,
  CONSENT_VERSION,
  type ConsentState,
  consentCookieOptions,
  consentPromptContextSchema,
  serializeConsentCookie,
} from "@/lib/analytics/consent";
import { trackServerEvent } from "@/lib/analytics/server";
import { cookies } from "next/headers";

export async function saveAnalyticsConsent(
  values: unknown,
  promptContext?: unknown,
): Promise<ConsentState> {
  const parsed = analyticsConsentValuesSchema.parse(values);
  const context = consentPromptContextSchema.safeParse(promptContext);
  const consent: ConsentState = {
    ...parsed,
    decidedAt: Math.floor(Date.now() / 1000),
    status: "decided",
  };
  const store = await cookies();
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
