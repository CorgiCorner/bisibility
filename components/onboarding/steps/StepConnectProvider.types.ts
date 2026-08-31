import type { OnboardingFlowState } from "@/components/onboarding/onboarding-fixtures";
import type { TestProviderConnectionInput } from "@/lib/schemas/provider";
import type { ReactNode } from "react";
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
  mode?: "modal" | "step";
  modalOpen?: boolean;
  onModalClose?: () => void;
  onModalExited?: () => void;
  analyticsNotice?: ReactNode;
  analyticsOption?: ReactNode;
  onComplete?: (values: OnboardingConnectProviderInput, connections: ConnectedProviderMap) => void;
  onContinueDisabledChange?: (disabled: boolean) => void;
  testProviderConnectionAction?: (
    input: TestProviderConnectionInput,
  ) => Promise<ProviderTestResult>;
};
