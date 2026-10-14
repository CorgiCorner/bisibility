"use client";
import type { RecoveryPage } from "@/lib/metering/recovery/contract";
import { useFormatter, useTranslations } from "next-intl";
export function RecoverySummary({ page }: { page: RecoveryPage }) {
  const t = useTranslations("instanceAdmin.recovery"),
    format = useFormatter();
  const summaries = [
    "unfinished",
    "failed",
    "unconfirmed",
    "historical",
    "retainedResults",
  ] as const;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {summaries.map((key) => (
          <div key={key} className="rounded-xl border border-border bg-bg-elev p-4">
            <p className="text-xs text-fg-muted">{t(`counts.${key}`)}</p>
            <p className="mt-1 text-2xl font-semibold">{format.number(page.summary[key])}</p>
          </div>
        ))}
      </div>
      {page.summary.blockedScopes && (
        <p className="text-sm text-warning">{t("blockedScopes", page.summary.blockedScopes)}</p>
      )}
      <div className="grid gap-2 text-xs text-fg-muted sm:grid-cols-2 xl:grid-cols-4">
        {(
          ["lastActivityAt", "lastCompletedAt", "lastCleanAt", "lastResultActivityAt"] as const
        ).map((key) => (
          <p key={key}>
            {t(key)}:{" "}
            {page.summary[key]
              ? format.dateTime(new Date(page.summary[key]), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : t("never")}
          </p>
        ))}
      </div>
    </>
  );
}
