import { useState } from "react";
import type { OnboardingWizardProps } from "./OnboardingWizard.types";

type Sources = Pick<
  OnboardingWizardProps,
  | "gscJustConnected"
  | "gscGoogleOAuth"
  | "gscPropertyLabel"
  | "hasOtherAnalyticsSource"
  | "hasAnalyticsSource"
  | "rankedKeywordConnections"
>;

export function useOnboardingSources(input: Sources) {
  const [gscInvalidated, invalidateGsc] = useState(false);
  const connections = input.rankedKeywordConnections ?? [];
  return {
    invalidateGsc: () => invalidateGsc(true),
    gscJustConnected: !gscInvalidated && input.gscJustConnected,
    gscGoogleOAuth: gscInvalidated ? null : input.gscGoogleOAuth,
    gscPropertyLabel: gscInvalidated ? null : input.gscPropertyLabel,
    hasAnalyticsSource:
      input.hasAnalyticsSource && (!gscInvalidated || input.hasOtherAnalyticsSource === true),
    rankedKeywordConnections: gscInvalidated
      ? connections.filter(({ provider }) => provider !== "gsc")
      : connections,
  };
}
