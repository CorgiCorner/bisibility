"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("projectSettingsDevelopers.webhooks");
  return (
    <Modal
      footer={
        <Button
          onClick={onClose}
          size="sm"
          startIcon={<CheckCircle aria-hidden size={15} weight="regular" />}
          type="button"
        >
          {t("done")}
        </Button>
      }
      headerDivider
      onClose={onClose}
      open={Boolean(issuedHook)}
      size="md"
      title={
        <span className="block">
          <span className="block">{t("rotatedTitle")}</span>
          <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            {t("rotatedDescription")}
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
