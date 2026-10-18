import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { CONSENT_COOKIE, parseConsentCookie } from "@/lib/analytics/consent";
import { providerRequiresConsent, resolveAnalyticsProvider } from "@/lib/analytics/provider";
import { resolveServerAnalyticsUser } from "@/lib/analytics/server-user";
import { getOptionalAvailableSession } from "@/lib/auth/session";
import { cookies } from "next/headers";

export async function ConsentSlot() {
  const provider = resolveAnalyticsProvider(process.env);
  if (!providerRequiresConsent(provider)) return null;
  const store = await cookies();
  const browser = parseConsentCookie(store.get(CONSENT_COOKIE)?.value);
  let session: Awaited<ReturnType<typeof getOptionalAvailableSession>>;
  try {
    session = await getOptionalAvailableSession();
  } catch {
    return null;
  }
  const consent = session
    ? ((await resolveServerAnalyticsUser(session.user.id, browser))?.consent ?? {
        ...browser,
        analytics: false,
        analyticsNeedsDecision: true,
      })
    : browser;
  return consent.status === "pending" ||
    consent.replayNeedsDecision ||
    consent.analyticsNeedsDecision ? (
    <ConsentBanner initialConsent={consent} />
  ) : null;
}
