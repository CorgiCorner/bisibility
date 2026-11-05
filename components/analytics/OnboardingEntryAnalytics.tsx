"use client";

import { useOnboardingEntryAnalytics } from "@/components/analytics/use-onboarding-entry-analytics";

export function OnboardingEntryAnalytics() {
  const entryRef = useOnboardingEntryAnalytics();
  return <span aria-hidden hidden ref={entryRef} />;
}
