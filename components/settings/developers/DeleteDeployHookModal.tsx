"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useTranslations } from "next-intl";

type DeleteDeployHookModalProps = {
  busy: boolean;
  hookLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
};

export function DeleteDeployHookModal({
  busy,
  hookLabel,
  onClose,
  onConfirm,
  open,
}: Readonly<DeleteDeployHookModalProps>) {
  const t = useTranslations("projectSettingsDevelopers.webhooks");
  return (
    <Modal
      footer={
        <>
          <Button disabled={busy} onClick={onClose} size="sm" type="button" variant="ghost">
            {t("cancel")}
          </Button>
          <Button
            loading={busy}
            loadingLabel={t("deleting")}
            onClick={onConfirm}
            size="sm"
            startIcon={<Trash aria-hidden size={15} weight="regular" />}
            type="button"
            variant="destructive"
          >
            {t("delete")}
          </Button>
        </>
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      open={open}
      showClose={false}
      size="sm"
      title={t("deleteTitle")}
    >
      <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
        {t("deleteDescription", { label: hookLabel })}
      </p>
    </Modal>
  );
}
