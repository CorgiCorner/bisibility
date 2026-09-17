"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import type { SelectSearchInsightsPropertyAction } from "@/lib/actions/search-insights";
import { formatDisplayDate } from "@/lib/dates/format";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type ArchivedActivationTarget = {
  displayName: string;
  lastSyncedDate: string;
  value: string;
};

type ArchivedActivationProps = {
  currentDisplayName: string;
  onClose: () => void;
  projectId: string;
  selectPropertyAction: SelectSearchInsightsPropertyAction;
  target: ArchivedActivationTarget | null;
};

export function SearchInsightsArchivedActivation({
  currentDisplayName,
  onClose,
  projectId,
  selectPropertyAction,
  target,
}: Readonly<ArchivedActivationProps>) {
  const dateDisplay = useDateDisplay();
  const t = useTranslations("projectSearchInsights.copy");
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!target || busy) return;
    setBusy(true);
    try {
      const result = await selectPropertyAction({ projectId, property: target.value });
      if (result.status === "reauth_required") {
        showToast(t("reauthRequired"), { severity: "connection" });
        return;
      }
      onClose();
      router.refresh();
    } catch (error) {
      showToast(actionErrorMessage(error, t("selectFailed")), { severity: "error" });
    } finally {
      setBusy(false);
    }
  }

  const targetName = target?.displayName ?? t("thisProperty");
  return (
    <Modal
      dismissDisabled={busy}
      footer={
        <>
          <Button disabled={busy} onClick={onClose} variant="secondary">
            {t("keepProperty", { property: currentDisplayName })}
          </Button>
          <Button loading={busy} onClick={() => void confirm()} variant="primary">
            {t("makePropertyActive", { property: targetName })}
          </Button>
        </>
      }
      onClose={onClose}
      onPrimaryAction={() => void confirm()}
      open={target !== null}
      primaryActionDisabled={busy}
      size="sm"
      title={t("makePropertyActiveTitle", { property: targetName })}
    >
      <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
        {t("archivedActivationBody", {
          currentProperty: currentDisplayName,
          date: target ? formatDisplayDate(target.lastSyncedDate, dateDisplay) : t("lastSync"),
        })}
      </p>
    </Modal>
  );
}
