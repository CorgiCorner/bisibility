"use client";

import { IdChip } from "@/components/ui/IdChip";
import type { FailureBreakdown } from "@/lib/ops/instance-admin-health";
import { useFormatter, useTranslations } from "next-intl";

type FailureTranslations = ReturnType<typeof useTranslations<"instanceAdmin.failureBreakdown">>;

function relativeTime(value: string, now: string, t: FailureTranslations): string {
  const timestamp = Date.parse(value);
  const reference = Date.parse(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(reference)) return t("unavailable");

  const elapsedSeconds = Math.max(0, Math.floor((reference - timestamp) / 1_000));
  if (elapsedSeconds < 60) return t("justNow");

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return t("minutesAgo", { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });

  return t("daysAgo", { count: Math.floor(hours / 24) });
}

export function AdminFailureBreakdown({
  breakdown,
  emptyLabel,
  now,
}: Readonly<{ breakdown: FailureBreakdown; emptyLabel?: string; now: string }>) {
  const format = useFormatter();
  const t = useTranslations("instanceAdmin.failureBreakdown");
  if (breakdown.groups.length === 0) {
    return <p className="text-xs text-fg-muted">{emptyLabel ?? t("empty")}</p>;
  }

  return (
    <div className="flex flex-col">
      {breakdown.groups.map((group) => {
        const concentrated = group.projectIds.length > 0;
        return (
          <div
            className="flex flex-wrap items-center gap-3 border-b border-border px-0.5 py-3 last:border-0"
            data-admin-failure-group
            key={`${group.provider}:${group.errorSummary}`}
          >
            <span className="min-w-[5.5rem] shrink-0 text-base font-bold tabular-nums tracking-tight text-fg">
              {format.number(group.count)}
            </span>
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="text-xs font-semibold text-fg">{group.errorSummary}</span>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <span className="text-xs text-fg-muted">{group.provider}</span>
            </span>
            <span className="text-xs text-fg-muted">
              {concentrated
                ? t("projectCount", { count: group.projectCount })
                : t("acrossProjects", { count: group.projectCount })}
            </span>
            {concentrated ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {group.projectIds.map((projectId) => (
                  <IdChip
                    copyLabel={t("copyProjectId")}
                    key={projectId}
                    size="sm"
                    value={projectId}
                  />
                ))}
              </span>
            ) : null}
            <span className="ml-auto whitespace-nowrap text-[10px] tabular-nums text-fg-muted">
              {t("firstSeen", { time: relativeTime(group.firstSeen, now, t) })}
              <span
                aria-hidden="true"
                className="mx-2 inline-block h-2.5 w-px bg-border align-middle"
              />
              {t("lastSeen", { time: relativeTime(group.lastSeen, now, t) })}
            </span>
          </div>
        );
      })}
      {breakdown.remainderCount > 0 ? (
        <p className="px-0.5 py-2 text-xs text-fg-muted">
          {t("moreClasses", { count: breakdown.remainderCount })}
        </p>
      ) : null}
    </div>
  );
}
