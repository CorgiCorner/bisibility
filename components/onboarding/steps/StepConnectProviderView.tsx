import { feedbackClass } from "@/components/onboarding/onboarding-form-utils";
import type { ComponentProps, ReactNode } from "react";
import { StepConnectProviderEditor } from "./StepConnectProviderEditor";

type Props = Omit<
  ComponentProps<typeof StepConnectProviderEditor>,
  "actionError" | "providerError"
> & {
  actionError?: string | null;
  providerError?: string;
};

export function StepConnectProviderView({ actionError, providerError, ...props }: Readonly<Props>) {
  const actionErrorNode: ReactNode = actionError ? (
    <p className={`m-0 mt-3 ${feedbackClass} text-red-text`} role="alert">
      {actionError}
    </p>
  ) : null;
  const providerErrorNode: ReactNode = providerError ? (
    <p className={`m-0 mt-2 ${feedbackClass} text-red-text`}>{providerError}</p>
  ) : null;
  return (
    <StepConnectProviderEditor
      {...props}
      actionError={actionErrorNode}
      providerError={providerErrorNode}
    />
  );
}
