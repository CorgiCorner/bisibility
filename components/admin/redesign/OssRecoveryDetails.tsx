"use client";
import { RecoveryEvidence } from "@/components/admin/recovery/RecoveryEvidence";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import type { RecoveryCase } from "@/lib/metering/recovery/contract";
import { useTranslations } from "next-intl";
import type { Dispatch, SetStateAction } from "react";

export type RecoveryTriage = {
  status: string;
  reason: string;
  due: string;
  snoozedUntil: string | null;
  assign: boolean;
};
export function OssRecoveryDetails({
  detail,
  triage,
  setTriage,
  busy,
  triageError,
  triageNotice,
  onClose,
  onSaveTriage,
}: {
  detail: RecoveryCase | null;
  triage: RecoveryTriage;
  setTriage: Dispatch<SetStateAction<RecoveryTriage>>;
  busy: boolean;
  triageError?: string;
  triageNotice?: string;
  onClose: () => void;
  onSaveTriage: (row: RecoveryCase, triage: RecoveryTriage) => void;
}) {
  const t = useTranslations("instanceAdmin.recovery");
  const p = useTranslations("instanceAdmin.pages");
  return (
    <Modal open={!!detail} onClose={onClose} title={p("details")} size="lg">
      {detail && (
        <div className="grid gap-4 text-sm">
          <p>
            {detail.project ?? p("retainedScope")} · {detail.provider}
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            {(["send", "work"] as const).map((axis) => (
              <div key={axis}>
                <dt>{t(axis)}</dt>
                <dd className="m-0">{t(`states.${detail[axis]}`)}</dd>
              </div>
            ))}
          </dl>
          {detail.accounting === "unknown" && (
            <p>
              {t("accounting")}: {t("states.unknown")}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {(["classification", "acceptance", "incident", "lookup"] as const).map((column) => (
              <div key={column}>
                <h4 className="text-xs text-fg-muted">{p(`evidenceColumns.${column}`)}</h4>
                <RecoveryEvidence value={detail.evidence} column={column} showCost={false} />
              </div>
            ))}
          </div>
          <dl className="grid gap-2">
            {Object.entries({
              [t("created")]: detail.createdAt,
              [t("connection")]: detail.connection ?? p("retainedScope"),
              [t("taskOnly.accountingState")]:
                detail.accounting === "unknown"
                  ? t("taskOnly.unknown")
                  : t(`states.${detail.accounting}`),
              [p("failureClass")]: detail.failure ? t(`failureCodes.${detail.failure.code}`) : "-",
              [p("attempts")]: detail.failure?.attempts ?? 0,
              [t("firstFailure")]: detail.failure?.firstFailedAt ?? "-",
              [t("lastFailure")]: detail.failure?.failedAt ?? "-",
              [t("recommended")]: detail.action
                ? t(`actions.${detail.action}`)
                : t("needsEvidence"),
              [p("blockedReason")]: detail.blockedReason
                ? t(
                    detail.blockedReason === "proof_missing"
                      ? "evidence.taskLookupReason"
                      : detail.blockedReason === "authorization_required"
                        ? "taskOnly.authorizationRequired"
                        : `blocked.${detail.blockedReason}`,
                  )
                : "-",
            }).map(([label, value]) => (
              <div key={label}>
                <dt className="text-fg-muted">{label}</dt>
                <dd className="m-0">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm leading-relaxed text-fg-muted">{t("taskOnly.newAttemptNote")}</p>
          {detail.spendingBlocked?.project && <p>{t("taskOnly.projectBlocked")}</p>}
          {detail.spendingBlocked?.connection && <p>{t("taskOnly.connectionBlocked")}</p>}
          {detail.closedUnknown ? (
            <p>{t("taskOnly.closedUnknownNote")}</p>
          ) : (
            <>
              <h4 className="font-semibold">{p("triage")}</h4>
              <p className="text-xs text-fg-muted">{t("taskOnly.triageNote")}</p>
              <MenuSelect
                ariaLabel={p("triageStatus")}
                value={triage.status}
                onChange={(status) =>
                  setTriage({
                    ...triage,
                    status,
                    reason:
                      status === "waiting_evidence" || status === "escalated"
                        ? "missing_proof"
                        : triage.reason,
                  })
                }
                options={(
                  [
                    "open",
                    "acknowledged",
                    "investigating",
                    "waiting_evidence",
                    "escalated",
                  ] as const
                ).map((value) => ({ value, label: p(`triageStatuses.${value}`) }))}
              />
              <MenuSelect
                ariaLabel={p("triageReason")}
                value={triage.reason}
                onChange={(reason) => setTriage({ ...triage, reason })}
                options={(
                  [
                    "none",
                    "investigating",
                    "provider_support",
                    "waiting_export",
                    "missing_proof",
                  ] as const
                ).map((value) => ({ value, label: p(`triageReasons.${value}`) }))}
              />
              {triage.status === "waiting_evidence" && (
                <MenuSelect
                  ariaLabel={p("due")}
                  value={triage.snoozedUntil ?? triage.due}
                  onChange={(due) => setTriage({ ...triage, due, snoozedUntil: null })}
                  options={[
                    ...(triage.snoozedUntil
                      ? [{ value: triage.snoozedUntil, label: triage.snoozedUntil }]
                      : []),
                    ...["1", "24", "168"].map((value) => ({
                      value,
                      label: t("hours", { count: Number(value) }),
                    })),
                  ]}
                />
              )}
              <Checkbox
                label={t("assign")}
                checked={triage.assign}
                onChange={(event) => setTriage({ ...triage, assign: event.target.checked })}
              />
              {triageError && <p role="alert">{triageError}</p>}
              {triageNotice && <p role="status">{triageNotice}</p>}
              {["waiting_evidence", "escalated"].includes(triage.status) &&
                triage.reason === "none" && <p role="status">{p("reasonRequired")}</p>}
              <Button
                className="justify-self-start"
                size="sm"
                disabled={
                  busy ||
                  (["waiting_evidence", "escalated"].includes(triage.status) &&
                    triage.reason === "none")
                }
                onClick={() => {
                  onSaveTriage(detail, triage);
                }}
              >
                {p("saveTriage")}
              </Button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
