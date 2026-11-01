"use client";
import type { RecoveryEvidenceView } from "@/lib/metering/recovery/evidence-model";
import { useFormatter, useTranslations } from "next-intl";

type EvidenceColumn = "classification" | "acceptance" | "incident" | "lookup";
export function RecoveryEvidence({
  value,
  column,
}: {
  value?: RecoveryEvidenceView;
  column: EvidenceColumn;
}) {
  const t = useTranslations("instanceAdmin.recovery.evidence");
  const format = useFormatter();
  const timestamp = (value: string | null | undefined) =>
    value
      ? t("utcTimestamp", {
          timestamp: format.dateTime(new Date(value), {
            dateStyle: "medium",
            timeStyle: "medium",
            timeZone: "UTC",
          }),
        })
      : "-";
  const projection = value?.projection;
  if (column === "incident")
    return value?.incident ? (
      <div className="text-xs leading-5">
        <a className="text-accent-text underline underline-offset-2" href={value.incident.href}>
          {t("incident")}
        </a>
        <time dateTime={value.incident.openedAt} className="block tabular-nums">
          {timestamp(value.incident.openedAt)}
        </time>
        <span>{t("age", { minutes: value.incident.ageMinutes })}</span>
      </div>
    ) : (
      <span className="text-fg-muted">-</span>
    );
  if (!projection) return <span className="text-fg-muted">-</span>;
  if (column === "classification")
    return (
      <div className="text-xs leading-5">
        <div>
          {t("result")}: {projection.result ? t(`results.${projection.result}`) : t("unclassified")}
        </div>
        <div>
          {t("cost")}: {projection.cost ? t(`costs.${projection.cost}`) : t("unclassified")}
        </div>
      </div>
    );
  if (column === "acceptance")
    return (
      <div className="text-xs leading-5">
        <div>
          {projection.acceptance
            ? t(`acceptanceStates.${projection.acceptance}`)
            : t("unclassified")}
        </div>
        <div>
          {value?.closedUnknown
            ? t("recoveryStates.closed_unknown")
            : projection.recovery?.state
              ? t(`recoveryStates.${projection.recovery.state}`)
              : t("unclassified")}
        </div>
      </div>
    );
  return (
    <dl className="m-0 text-xs leading-5">
      <dt>{t("last")}</dt>
      <dd className="m-0 tabular-nums">{timestamp(projection.recovery?.lastAttemptAt)}</dd>
      <dt>{t("next")}</dt>
      <dd className="m-0 tabular-nums">{timestamp(projection.recovery?.nextAttemptAt)}</dd>
      <dt>{t("reason")}</dt>
      <dd className="m-0 break-words">{projection.recovery?.reason ?? "-"}</dd>
    </dl>
  );
}
