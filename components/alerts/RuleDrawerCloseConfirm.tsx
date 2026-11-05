"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useTranslations } from "next-intl";

export function RuleDrawerCloseConfirm({
  open,
  pending,
  onCancel,
  onDiscard,
}: Readonly<{
  open: boolean;
  pending: boolean;
  onCancel: () => void;
  onDiscard: () => void;
}>) {
  const t = useTranslations("projectAlerts.drawer");
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t("discardTitle")}
      size="sm"
      footer={
        <>
          <Button onClick={onCancel} type="button" variant="secondary">
            {t("keepEditing")}
          </Button>
          <Button disabled={pending} onClick={onDiscard} type="button" variant="destructive">
            {t("discard")}
          </Button>
        </>
      }
    >
      <p className="m-0 text-[13px] text-fg-muted">
        {pending ? t("savePending") : t("discardDetail")}
      </p>
    </Modal>
  );
}
