"use client";

import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

export function AcknowledgeAllButton({
  canUpdate,
  count,
  onConfirm,
  projectName,
}: Readonly<{
  canUpdate: boolean;
  count: number;
  onConfirm: () => Promise<void>;
  projectName: string;
}>) {
  const t = useTranslations("projectAlerts.feed");
  const { readOnly } = useProjectWriteMode();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const disabled = !canUpdate || readOnly || count === 0 || pending;
  async function confirm() {
    if (disabled || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <ProjectReadOnlyTooltip disabledReason={!canUpdate ? t("readOnly") : undefined}>
        <Button
          disabled={disabled}
          onClick={() => setOpen(true)}
          size="sm"
          startIcon={<Check aria-hidden size={13} weight="regular" />}
          type="button"
          variant="secondary"
        >
          {t("markAllRead")}
        </Button>
      </ProjectReadOnlyTooltip>
      <Modal
        open={open}
        onClose={() => {
          if (!pendingRef.current) setOpen(false);
        }}
        title={t("markAllRead")}
        size="sm"
        footer={
          <>
            <Button
              disabled={pending}
              onClick={() => setOpen(false)}
              type="button"
              variant="secondary"
            >
              {t("cancel")}
            </Button>
            <Button disabled={disabled} onClick={() => void confirm()} type="button">
              {t("markAllRead")}
            </Button>
          </>
        }
      >
        <p className="m-0 text-[13px] text-fg-muted">
          {t("acknowledgeConfirm", { count, project: projectName })}
        </p>
      </Modal>
    </>
  );
}
