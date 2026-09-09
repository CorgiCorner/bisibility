import { onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
import type { FormEventHandler, ReactNode } from "react";
import { StepConnectProviderModal } from "./StepConnectProviderModal";

type Props = {
  busy: boolean;
  disabled: boolean;
  editor: ReactNode;
  mode: "modal" | "step";
  onCancel?: () => void;
  onExited: () => void;
  onSave: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  open?: boolean;
};

export function StepConnectProviderLayout({
  busy,
  disabled,
  editor,
  mode,
  onCancel,
  onExited,
  onSave,
  onSubmit,
  open,
}: Readonly<Props>) {
  if (mode === "modal")
    return (
      <StepConnectProviderModal
        busy={busy}
        disabled={disabled}
        onCancel={onCancel}
        onExited={onExited}
        onSave={onSave}
        open={Boolean(open)}
      >
        {editor}
      </StepConnectProviderModal>
    );
  return (
    <form id={onboardingFormId} onSubmit={onSubmit}>
      {editor}
    </form>
  );
}
