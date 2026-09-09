"use client";

import {
  applyAnalyticsConsent,
  identifyAnalyticsUser,
  resetAnalyticsIdentity,
  setAnalyticsReplay,
} from "@/lib/analytics/client";
import type { ConsentState } from "@/lib/analytics/consent";
import { readBrowserConsent } from "@/lib/analytics/consent-client";
import type { AnalyticsProvider } from "@/lib/analytics/provider";
import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

export function useAnalyticsProviderSync({
  consent,
  provider,
  userId,
}: {
  consent: ConsentState;
  provider: AnalyticsProvider;
  userId?: string;
}) {
  const pathname = usePathname();

  // Synchronize React consent, route, and identity state with the external analytics runtime.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Route changes must re-read consent and reconcile route-scoped replay even when identity is unchanged.
  useLayoutEffect(() => {
    if (provider !== "posthog") return;
    const current = readBrowserConsent(consent);
    applyAnalyticsConsent(current);
    setAnalyticsReplay(current.replay && !current.replayNeedsDecision);
    if (current.analytics && userId) identifyAnalyticsUser(userId);
    else resetAnalyticsIdentity();
  }, [consent, pathname, provider, userId]);
}
