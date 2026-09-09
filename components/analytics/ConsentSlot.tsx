import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { CONSENT_COOKIE, parseConsentCookie } from "@/lib/analytics/consent";
import { providerRequiresConsent, resolveAnalyticsProvider } from "@/lib/analytics/provider";
import { cookies } from "next/headers";

export async function ConsentSlot() {
  const provider = resolveAnalyticsProvider(process.env);
  if (!providerRequiresConsent(provider)) return null;
  const store = await cookies();
  const consent = parseConsentCookie(store.get(CONSENT_COOKIE)?.value);
  return consent.status === "pending" || consent.replayNeedsDecision ? (
    <ConsentBanner initialConsent={consent} />
  ) : null;
}
