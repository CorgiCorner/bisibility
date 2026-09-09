"use client";

import { useOnboardingEntryAnalytics } from "@/components/analytics/use-hero-experiment";

export function OnboardingEntryAnalytics() {
  const entryRef = useOnboardingEntryAnalytics();
  return <span aria-hidden hidden ref={entryRef} />;
}
