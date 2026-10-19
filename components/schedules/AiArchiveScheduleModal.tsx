"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { AiScheduleListRow } from "./ai-schedule-rows";

/** Plain confirmation for archiving an AI schedule. AI schedules have no keyword members. */
export function AiArchiveScheduleModal({
  onArchive,
  onClose,
  schedule,
}: Readonly<{
  onArchive: (row: AiScheduleListRow) => Promise<void>;
  onClose: () => void;
  schedule: AiScheduleListRow;
}>) {
  const t = useTranslations("projectRuns.schedules");
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onArchive(schedule);
      showToast(t("ai.archived"), { severity: "success" });
      onClose();
    } catch {
      setError(t("ai.archiveFailed"));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      dismissDisabled={pending}
      title={t("archiveDialog.title", { name: schedule.name })}
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            loading={pending}
            loadingLabel={t("lifecycle.archiving")}
            onClick={() => void confirm()}
          >
            {t("archiveSchedule")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-sm text-fg-muted">{t("ai.archiveBody")}</p>
        {error ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
