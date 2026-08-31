"use client";
import { Button, Modal } from "@/components/ui";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  busy: boolean;
  disabled: boolean;
  label: string;
  onCancel?: () => void;
  onExited?: () => void;
  onSave: () => void;
  open: boolean;
};
export function StepConnectProviderModal({
  busy,
  children,
  disabled,
  label,
  onCancel,
  onExited,
  onSave,
  open,
}: Readonly<Props>) {
  return (
    <Modal
      dismissDisabled={busy}
      footer={
        <>
          <Button disabled={busy} onClick={onCancel} size="md" type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={disabled}
            loading={busy}
            onClick={onSave}
            size="md"
            type="button"
            variant="primary"
          >
            Save {label}
          </Button>
        </>
      }
      initialFocus={() =>
        document.querySelector<HTMLElement>("[name=onboarding-serp-provider]")?.focus()
      }
      onClose={() => onCancel?.()}
      onExited={onExited}
      open={open}
      size="lg"
      title="Connect a provider"
    >
      <div id="onboarding-provider-modal">{children}</div>
    </Modal>
  );
}
