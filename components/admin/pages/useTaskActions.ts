"use client";
import type { RecoveryTriage } from "@/components/admin/redesign/OssRecoveryDetails";
import { updateRecoveryTriageAction } from "@/lib/actions/metering-recovery";
import type { RecoveryCase } from "@/lib/metering/recovery/contract";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { type RecoveryRoute, useRecoveryBatch } from "./useRecoveryBatch";
export function useTaskActions(
  refresh: () => void,
  route?: RecoveryRoute,
  cases: readonly Pick<RecoveryCase, "reference" | "token">[] = [],
) {
  const t = useTranslations("instanceAdmin.recovery");
  const messages = useTranslations("instanceAdmin.pages");
  const batch = useRecoveryBatch(route, cases);
  const [busy, start] = useTransition();
  const [triageError, setTriageError] = useState<string>();
  const [triageNotice, setTriageNotice] = useState<string>();
  return {
    ...batch,
    busy: busy || batch.busy,
    triageError,
    triageNotice,
    onSaveTriage: (row: RecoveryCase, triage: RecoveryTriage) =>
      start(async () => {
        setTriageError(undefined);
        setTriageNotice(undefined);
        try {
          const result = await updateRecoveryTriageAction({
            caseToken: row.token,
            expectedVersion: row.version,
            status: triage.status,
            reason: triage.reason === "none" ? null : triage.reason,
            assignToMe: triage.assign,
            snoozedUntil:
              triage.status === "waiting_evidence"
                ? (triage.snoozedUntil ??
                  new Date(Date.now() + Number(triage.due) * 3600000).toISOString())
                : null,
          });
          if (result.ok) {
            setTriageNotice(messages("triageSaved"));
            refresh();
          } else setTriageError(t(`errors.${result.code}`));
        } catch {
          setTriageError(t("errors.unavailable"));
        }
      }),
  };
}
