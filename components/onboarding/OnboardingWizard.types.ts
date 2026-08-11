import type { GoogleOAuthSetup } from "@/lib/integrations/types";
import type { RankedKeywordConnection } from "@/lib/ranked-keywords/service";
import type { OnboardingFlowState, OnboardingStepNumber } from "./onboarding-fixtures";
import type { OnboardingWizardActions } from "./onboarding-wizard-actions";
import type { OnboardingProject } from "./onboarding-wizard-state";
import type { ConnectedProviderMap } from "./steps/StepConnectProvider.fields";

export type OnboardingWizardProps = {
  actions: OnboardingWizardActions;
  costPerCheckCents: number | null;
  dataResidencyMessage: string;
  gscJustConnected: boolean;
  gscGoogleOAuth?: GoogleOAuthSetup | null;
  gscOAuthConfigured: boolean;
  gscPropertyLabel?: string | null;
  hasAnalyticsSource: boolean;
  initialHasApiKey: boolean;
  initialFlowState: OnboardingFlowState;
  initialKeywordCount: number;
  initialProject: OnboardingProject | null;
  initialSerpConnections?: ConnectedProviderMap;
  initialStep: OnboardingStepNumber;
  isCloud?: boolean;
  monthlyCapCents: number;
  providerConnected: boolean;
  rankedKeywordConnections?: RankedKeywordConnection[];
};
