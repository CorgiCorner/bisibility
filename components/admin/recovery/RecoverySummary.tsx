"use client";
import type { RecoveryPage } from "@/lib/metering/recovery/contract";
import { useFormatter, useTranslations } from "next-intl";
export function RecoverySummary({ page }: { page: RecoveryPage }) {
  const t = useTranslations("instanceAdmin.recovery"),
    format = useFormatter();
  const summaries = [
    "unfinished",
    "unconfirmed",
    "closedUnknown",
    "failed",
    "historical",
    "retainedResults",
  ] as const;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {summaries.map((key) => (
          <div key={key} className="rounded-xl border border-border bg-bg-elev p-4">
            <p className="text-xs text-fg-muted">{t(`counts.${key}`)}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {format.number(page.summary[key] ?? 0)}
            </p>
          </div>
        ))}
      </div>
      {!!page.summary.closedUnknown && (
        <p className="text-sm leading-relaxed text-fg-muted">{t("closedUnknownNote")}</p>
      )}
      {page.summary.blockedScopes &&
        (page.summary.blockedScopes.projects > 0 || page.summary.blockedScopes.connections > 0) && (
          <p className="text-sm text-warning">{t("blockedScopes", page.summary.blockedScopes)}</p>
        )}
      <div className="grid gap-3 rounded-card border border-border-soft bg-bg-sunken p-4 text-xs text-fg-muted sm:grid-cols-2 xl:grid-cols-4">
        {(
          ["lastActivityAt", "lastCompletedAt", "lastCleanAt", "lastResultActivityAt"] as const
        ).map((key) => (
          <div key={key}>
            <p className="leading-relaxed">{t(key)}</p>
            <p className="mt-1 font-medium text-fg tabular-nums">
              {page.summary[key]
                ? format.dateTime(new Date(page.summary[key]), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : t("never")}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
