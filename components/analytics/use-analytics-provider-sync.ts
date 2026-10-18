"use client";

import {
  applyAnalyticsConsent,
  identifyAnalyticsUser,
  pauseAnalyticsConsent,
  resetAnalyticsIdentity,
  setAnalyticsConsentScope,
  setAnalyticsReplay,
} from "@/lib/analytics/client";
import type { ConsentState } from "@/lib/analytics/consent";
import { readBrowserConsent } from "@/lib/analytics/consent-client";
import type { AnalyticsProvider } from "@/lib/analytics/provider";
import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { useAccountConsentSync } from "./use-account-consent-sync";

export function useAnalyticsProviderSync({
  authenticated,
  consent,
  provider,
  userId,
}: {
  authenticated?: boolean;
  consent: ConsentState;
  provider: AnalyticsProvider;
  userId?: string;
}) {
  const pathname = usePathname();
  const account = useAccountConsentSync(provider, userId, authenticated, pathname);

  // Synchronize React consent, route, and identity state with the external analytics runtime.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Route changes must re-read consent and reconcile route-scoped replay even when identity is unchanged.
  useLayoutEffect(() => {
    if (provider !== "posthog") return;
    setAnalyticsConsentScope(userId, authenticated);
    const current = { ...readBrowserConsent(account.consent ?? consent) };
    if (!account.ready) current.analytics = false;
    else if (account.consent) current.analytics = current.analytics && account.consent.analytics;
    const rechecking = !account.ready && account.rechecking;
    if (rechecking) pauseAnalyticsConsent(current);
    else applyAnalyticsConsent(current);
    setAnalyticsReplay(current.replay && !current.replayNeedsDecision);
    if (rechecking) return;
    if (current.analytics && userId) identifyAnalyticsUser(userId);
    else resetAnalyticsIdentity();
  }, [
    account.consent,
    account.ready,
    account.rechecking,
    authenticated,
    consent,
    pathname,
    provider,
    userId,
  ]);
  return { ready: account.ready, consent: account.consent ?? consent };
}
