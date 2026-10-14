"use client";
import { AppDrawer } from "@/components/ui/AppDrawer";
import type { RecoveryCase } from "@/lib/metering/recovery/contract";
import { useFormatter, useTranslations } from "next-intl";
import { RecoveryAxes } from "./RecoveryAxes";
import { RecoveryTriageForm } from "./RecoveryTriageForm";

export function RecoveryDetails({
  row,
  onClose,
  onSaved,
}: {
  row: RecoveryCase | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("instanceAdmin.recovery"),
    format = useFormatter();
  return (
    <AppDrawer open={row !== null} onClose={onClose} title={t("details")} sheetOnMobile>
      {row && (
        <div className="grid gap-6">
          <p className="break-words text-sm">
            {row.project ?? t("retainedScope")} · {row.provider}
          </p>
          <RecoveryAxes row={row} />
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-fg-muted">{t("created")}</dt>
              <dd>
                {format.dateTime(new Date(row.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">{t("connection")}</dt>
              <dd className="break-all">{row.connection ?? t("retainedScope")}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">{t("funding")}</dt>
              <dd>{t(`fundingSources.${row.funding}`)}</dd>
            </div>
          </dl>
          {row.unknownDimensions.length > 0 && (
            <p className="text-sm">
              {t("unknownDimensions")}:{" "}
              {row.unknownDimensions
                .map((unit) => {
                  const dimension =
                    unit === "provider_cost" || unit === "units" || unit === "requests"
                      ? unit
                      : "other";
                  return t(`dimensions.${dimension}`);
                })
                .join(", ")}
            </p>
          )}
          {row.failure && (
            <div className="rounded-xl border border-border p-4 text-sm">
              <p className="font-medium">{t(`failureCodes.${row.failure.code}`)}</p>
              <p className="mt-2 text-fg-muted">{t("attempts", { count: row.failure.attempts })}</p>
              <p>
                {t("firstFailure")}:{" "}
                {format.dateTime(new Date(row.failure.firstFailedAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p>
                {t("lastFailure")}:{" "}
                {format.dateTime(new Date(row.failure.failedAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          )}
          {row.action ? (
            <p className="text-sm">
              {t("recommended")}: {t(`actions.${row.action}`)}
            </p>
          ) : (
            <p className="text-sm text-fg-muted">
              {t(`blocked.${row.blockedReason ?? "proof_missing"}`)}
            </p>
          )}
          <p className="text-sm leading-relaxed text-fg-muted">{t("newAttemptNote")}</p>
          {row.spendingBlocked?.project && (
            <p className="text-sm text-warning">{t("projectBlocked")}</p>
          )}
          {row.spendingBlocked?.connection && (
            <p className="text-sm text-warning">{t("connectionBlocked")}</p>
          )}
          <RecoveryTriageForm key={row.version} row={row} onSaved={onSaved} />
        </div>
      )}
    </AppDrawer>
  );
}
