import type { OnboardingFlowState } from "@/components/onboarding/onboarding-fixtures";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import type { SaveOnboardingMarketsAction } from "./OnboardingMarkets";
import type {
  ConnectedProviderMap,
  OnboardingConnectProviderInput,
} from "./StepConnectProvider.fields";
import type { StepConnectProviderProps } from "./StepConnectProvider.types";
import type { OnboardingTrackingDefaultsInput } from "./step-schedule-model";
import type { FirstCheckRunActions } from "./use-first-check-run";

export type FirstCheckProject = {
  domain: string | null;
  isSample?: boolean;
  name: string;
  publicId?: string;
};
export type StepFirstCheckProps = FirstCheckRunActions & {
  completeOnboardingAction?: (input: { projectId: string }) => Promise<unknown>;
  connectProviderAction?: StepConnectProviderProps["connectProviderAction"];
  defaults?: ProjectDefaultsInput | OnboardingTrackingDefaultsInput;
  flowState?: OnboardingFlowState;
  hasAnalyticsSource?: boolean;
  initialConnections?: ConnectedProviderMap;
  initialKeywordText?: string | null;
  keywordCount?: number;
  keywordDraft?: string;
  nextCheckAt?: string | null;
  onBack?: () => void;
  onProviderConnected?: (
    values: OnboardingConnectProviderInput,
    connections: ConnectedProviderMap,
  ) => void;
  onTimezoneChange?: (timezone: string) => Promise<void> | void;
  project?: FirstCheckProject | null;
  projectedCostPerCheckCents?: number | null;
  providerConnected?: boolean;
  providerDefaultValues?: OnboardingConnectProviderInput;
  providerId?: string | null;
  saveMarketsAction?: SaveOnboardingMarketsAction;
  testProviderConnectionAction?: StepConnectProviderProps["testProviderConnectionAction"];
};
