import "server-only";

import {
  accountConsentState,
  readAccountAnalyticsConsent,
  seedAccountAnalyticsConsent,
} from "./account-consent";
import type { ConsentState } from "./consent";

export async function reconcileWebConsent(
  userId: string,
  browser: ConsentState,
): Promise<ConsentState> {
  let account = await readAccountAnalyticsConsent(userId);
  if (
    !account.decided_at &&
    browser.status === "decided" &&
    browser.decidedAt !== null &&
    !browser.analyticsNeedsDecision
  ) {
    account = await seedAccountAnalyticsConsent(userId, browser);
  }
  const current = accountConsentState(account);
  if (current.status !== "decided")
    return { ...browser, analytics: false, analyticsNeedsDecision: true };
  return {
    ...browser,
    analytics: current.analytics,
    ...(browser.analyticsNeedsDecision ? { analyticsNeedsDecision: false } : {}),
    // Keep replay and its original expiry local to an existing browser decision.
    decidedAt: browser.decidedAt ?? current.decidedAt,
    status: "decided",
  };
}
