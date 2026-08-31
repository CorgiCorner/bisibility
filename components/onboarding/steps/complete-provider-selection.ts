import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import type {
  ConnectedProviderMap,
  OnboardingConnectProviderInput,
  OnboardingSerpProviderId,
} from "./StepConnectProvider.fields";
import { savedProviderCompletionInput } from "./StepConnectProvider.fields";

type Complete = (values: OnboardingConnectProviderInput, connections: ConnectedProviderMap) => void;

export function completeProviderSelection(
  providerId: OnboardingSerpProviderId,
  values: OnboardingConnectProviderInput,
  connections: ConnectedProviderMap,
  flowState: OnboardingFlowState | undefined,
  onComplete: Complete | undefined,
  push: (href: string) => void,
) {
  const nextValues = savedProviderCompletionInput(
    values.projectId,
    providerId,
    values.costPerCheck,
  );
  if (onComplete) return onComplete(nextValues, connections);
  push(
    buildOnboardingStepHref(3, {
      ...flowState,
      providerId,
      projectId: nextValues.projectId,
    }),
  );
}
