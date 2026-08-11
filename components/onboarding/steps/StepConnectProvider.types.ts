import type { OnboardingFlowState } from "@/components/onboarding/onboarding-fixtures";
import type { TestProviderConnectionInput } from "@/lib/schemas/provider";
import type {
  ConnectedProviderMap,
  OnboardingConnectProviderInput,
  ProviderTestResult,
} from "./StepConnectProvider.fields";

export type StepConnectProviderProps = {
  connectProviderAction?: (input: OnboardingConnectProviderInput) => Promise<unknown>;
  defaultValues?: OnboardingConnectProviderInput;
  flowState?: OnboardingFlowState;
  initialConnections?: ConnectedProviderMap;
  onComplete?: (values: OnboardingConnectProviderInput, connections: ConnectedProviderMap) => void;
  onContinueDisabledChange?: (disabled: boolean) => void;
  onSkip?: (values: OnboardingConnectProviderInput) => void;
  testProviderConnectionAction?: (
    input: TestProviderConnectionInput,
  ) => Promise<ProviderTestResult>;
};
