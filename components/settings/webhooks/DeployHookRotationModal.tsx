"use client";

import { Button, Modal } from "@/components/ui";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";
import { DeployHookRevealContent } from "./DeployHookReveal";
import type { IssuedDeployHook } from "./deploy-hook-model";

type DeployHookRotationModalProps = {
  endpointUrl: string;
  issuedHook: IssuedDeployHook | null;
  onClose: () => void;
};

export function DeployHookRotationModal({
  endpointUrl,
  issuedHook,
  onClose,
}: Readonly<DeployHookRotationModalProps>) {
  return (
    <Modal
      footer={
        <Button
          onClick={onClose}
          size="sm"
          startIcon={<CheckCircle aria-hidden size={15} />}
          type="button"
        >
          Done
        </Button>
      }
      headerDivider
      onClose={onClose}
      open={Boolean(issuedHook)}
      size="md"
      title={
        <span className="block">
          <span className="block">Rotated deploy webhook</span>
          <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            The old token stopped working. Copy the replacement now.
          </span>
        </span>
      }
    >
      {issuedHook ? (
        <DeployHookRevealContent endpointUrl={endpointUrl} issuedHook={issuedHook} />
      ) : null}
    </Modal>
  );
}
