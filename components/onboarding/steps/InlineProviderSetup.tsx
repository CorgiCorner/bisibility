"use client";

import type { OnboardingFlowState } from "@/components/onboarding/onboarding-fixtures";
import { StepConnectProvider } from "./StepConnectProvider";
import type {
  ConnectedProviderMap,
  OnboardingConnectProviderInput,
} from "./StepConnectProvider.fields";
import type { StepConnectProviderProps } from "./StepConnectProvider.types";

type Props = {
  connectProviderAction?: StepConnectProviderProps["connectProviderAction"];
  defaultValues?: OnboardingConnectProviderInput;
  flowState?: OnboardingFlowState;
  initialConnections?: ConnectedProviderMap;
  open: boolean;
  onCollapse: () => void;
  onExited?: () => void;
  onComplete?: (values: OnboardingConnectProviderInput, connections: ConnectedProviderMap) => void;
  testProviderConnectionAction?: StepConnectProviderProps["testProviderConnectionAction"];
};

export function InlineProviderSetup(props: Readonly<Props>) {
  return (
    <StepConnectProvider
      connectProviderAction={props.connectProviderAction}
      defaultValues={props.defaultValues}
      flowState={props.flowState}
      initialConnections={props.initialConnections}
      mode="modal"
      modalOpen={props.open}
      onComplete={props.onComplete}
      onModalExited={props.onExited}
      onModalClose={props.onCollapse}
      testProviderConnectionAction={props.testProviderConnectionAction}
    />
  );
}
