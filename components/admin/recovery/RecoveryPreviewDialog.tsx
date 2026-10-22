"use client";
import { DangerousActionGate } from "@/components/admin/DangerousActionGate";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { RecoveryPreview, RecoveryUiError } from "@/lib/metering/recovery/contract";
import { useFormatter, useTranslations } from "next-intl";
export function RecoveryPreviewDialog({
  preview,
  error,
  busy,
  onClose,
  onCommit,
}: {
  preview: RecoveryPreview | null;
  error?: RecoveryUiError | null;
  busy: boolean;
  onClose: () => void;
  onCommit: () => void;
}) {
  const t = useTranslations("instanceAdmin.recovery"),
    format = useFormatter();
  return (
    <Modal
      open={preview !== null}
      onClose={onClose}
      title={t("preview")}
      dismissDisabled={busy}
      footer={
        <DangerousActionGate action="repairUsage">
          <Button disabled={busy || !preview?.eligible.length} onClick={onCommit}>
            {t("commit")}
          </Button>
        </DangerousActionGate>
      }
    >
      {error && (
        <p role="alert" className="text-sm text-danger">
          {t(`errors.${error}`)}
        </p>
      )}
      {preview && (
        <div className="grid gap-4 text-sm">
          <p>{t("previewCount", { count: preview.eligible.length })}</p>
          {(["recover_proof", "restore_result", "resume_queued_run"] as const).map((action) => {
            const count = preview.eligible.filter((item) => item.action === action).length;
            return count > 0 ? (
              <p key={action}>
                {t(`actions.${action}`)}: {count}
              </p>
            ) : null;
          })}
          <p className="rounded-xl border border-border bg-bg p-3">{t("noSpend")}</p>
          {preview.originalRuns > 0 && (
            <p className="rounded-xl border border-border p-3">
              {t("originalRunSpend", { count: preview.originalRuns })}
            </p>
          )}
          {preview.excluded.length > 0 && (
            <p>{t("excluded", { count: preview.excluded.length })}</p>
          )}
          <p className="text-fg-muted">
            {t("expires")}: {format.dateTime(new Date(preview.expiresAt), { timeStyle: "short" })}
          </p>
          <p className="text-fg-muted">{t("recheckNote")}</p>
        </div>
      )}
      {preview?.originalExposure?.map((item) => (
        <p key={item.caseToken}>
          {item.project ?? t("retainedScope")}:{" "}
          {t("approvedExposure", {
            cents: item.maxCostCents,
            targets: item.targets,
            attempts: item.maxAttempts,
          })}
        </p>
      ))}
    </Modal>
  );
}
