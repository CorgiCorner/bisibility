"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import type { SelectSearchInsightsPropertyAction } from "@/lib/actions/search-insights";
import { formatDateLabel } from "@/lib/search-insights/dates";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { REAUTH_REQUIRED, SELECT_FAILED } from "./search-insights-copy";

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
  const dateFormat = useDateFormat();
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!target || busy) return;
    setBusy(true);
    try {
      const result = await selectPropertyAction({ projectId, property: target.value });
      if (result.status === "reauth_required") {
        showToast(REAUTH_REQUIRED, { severity: "connection" });
        return;
      }
      onClose();
      router.refresh();
    } catch (error) {
      showToast(actionErrorMessage(error, SELECT_FAILED), { severity: "error" });
    } finally {
      setBusy(false);
    }
  }

  const targetName = target?.displayName ?? "this property";
  return (
    <Modal
      dismissDisabled={busy}
      footer={
        <>
          <Button disabled={busy} onClick={onClose} variant="secondary">
            Keep {currentDisplayName}
          </Button>
          <Button loading={busy} onClick={() => void confirm()} variant="primary">
            Make {targetName} active
          </Button>
        </>
      }
      onClose={onClose}
      onPrimaryAction={() => void confirm()}
      open={target !== null}
      primaryActionDisabled={busy}
      size="sm"
      title={`Make ${targetName} active?`}
    >
      <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
        {currentDisplayName} stops syncing and becomes an archive. We will fill the gap since{" "}
        {target ? formatDateLabel(target.lastSyncedDate, dateFormat) : "the last sync"}.
      </p>
    </Modal>
  );
}
