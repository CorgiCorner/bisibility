"use client";
import {
  DangerousActionAccessProvider,
  DangerousActionGate,
} from "@/components/admin/DangerousActionGate";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { RecoveryPreview } from "@/lib/metering/recovery/contract";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function OssRecoveryBatchDialog({
  open,
  preview,
  busy,
  twoFactorEnabled,
  now,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  preview?: RecoveryPreview | null;
  busy: boolean;
  twoFactorEnabled: boolean;
  now?: number;
  error?: string;
  onClose: () => void;
  onConfirm: (preview: RecoveryPreview) => boolean | undefined | Promise<boolean | undefined>;
}) {
  const t = useTranslations("instanceAdmin.recovery");
  const p = useTranslations("instanceAdmin.pages");
  const [expiredNotice, setExpiredNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const isExpired =
    !!preview &&
    (!Number.isFinite(Date.parse(preview.expiresAt)) ||
      Date.parse(preview.expiresAt) <= (now ?? Date.now()));
  return (
    <Modal
      open={open}
      onClose={() => {
        setSubmitError("");
        setExpiredNotice(false);
        onClose();
      }}
      dismissDisabled={busy || submitting}
      title={p("previewTitle")}
      footer={
        <Button
          disabled={
            busy || submitting || !preview?.eligible.length || !twoFactorEnabled || isExpired
          }
          onClick={async () => {
            if (
              preview &&
              (Date.parse(preview.expiresAt) <= (now ?? Date.now()) ||
                !Number.isFinite(Date.parse(preview.expiresAt)))
            ) {
              setExpiredNotice(true);
              return;
            }
            if (preview) {
              setSubmitting(true);
              setSubmitError("");
              try {
                if ((await onConfirm(preview)) === false) {
                  setSubmitError(p("startFailed"));
                } else {
                  onClose();
                }
              } catch {
                setSubmitError(p("startFailed"));
              } finally {
                setSubmitting(false);
              }
            }
          }}
        >
          {submitting ? p("starting") : p("confirm")}
        </Button>
      }
    >
      {!twoFactorEnabled && (
        <DangerousActionAccessProvider allowed={false}>
          <DangerousActionGate actionLabel={p("startRecovery")}>{null}</DangerousActionGate>
        </DangerousActionAccessProvider>
      )}
      {(isExpired || expiredNotice) && <p role="status">{p("expired")}</p>}
      {(error || submitError) && <p role="alert">{error || submitError}</p>}
      {preview ? (
        <div className="grid gap-3 text-sm">
          <p>
            {t("previewCount", { count: preview.eligible.length })} ·{" "}
            {t("excluded", { count: preview.excluded.length })}
          </p>
          {(["recover_proof", "restore_result", "resume_queued_run"] as const).map((action) => (
            <p key={action}>
              {t(`actions.${action}`)}:{" "}
              {preview.eligible.filter((item) => item.action === action).length}
            </p>
          ))}
          <p>{t("taskOnly.noSpend")}</p>
          {preview.originalRuns > 0 && (
            <p>{t("taskOnly.originalRun", { count: preview.originalRuns })}</p>
          )}
          <p>
            {t("expires")}: {preview.expiresAt}
          </p>
          <p className="text-fg-muted">{t("recheckNote")}</p>
          {preview.originalExposure?.map((item) => (
            <p key={item.caseToken}>
              {item.project ?? t("retainedScope")}:{" "}
              {t("approvedScope", { targets: item.targets, attempts: item.maxAttempts })}
            </p>
          ))}
        </div>
      ) : (
        <p role="status">{p("preparing")}</p>
      )}
    </Modal>
  );
}
