"use client";

import type { KeywordDeleteImpact as Impact } from "@/lib/keywords/delete-impact";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function KeywordDeleteImpact({
  impact,
  projectId,
}: Readonly<{ impact: Impact; projectId: string }>) {
  const t = useTranslations("projectRankTracker.deletion");
  return (
    <div className="mt-5 grid gap-3 border-t border-border pt-4">
      {impact.runningTargetCount > 0 ? (
        <p
          role="alert"
          className="m-0 rounded-control border border-border bg-bg-sunken px-3 py-2.5 text-[13px] leading-5 text-fg"
        >
          {t("runningBlocked", { count: impact.runningTargetCount })}
        </p>
      ) : null}
      <p className="m-0 text-[13px] font-semibold text-fg">
        {t("selection", { keywords: impact.keywordCount, targets: impact.targetCount })}
      </p>
      <p className="m-0 text-[12px] leading-5 text-fg-muted">{t("targetHint")}</p>
      {impact.schedules.length ? (
        <>
          <h3 className="m-0 text-[12px] font-semibold text-fg">{t("schedules")}</h3>
          <ul className="m-0 grid max-h-60 list-none gap-2 overflow-y-auto p-0">
            {impact.schedules.map((schedule) => (
              <li
                key={schedule.publicId}
                className="rounded-control border border-border bg-bg-sunken px-3 py-2.5"
              >
                <Link
                  className="text-[13px] font-semibold text-accent-text hover:underline"
                  href={projectSchedulesPath(projectId, schedule.publicId)}
                >
                  {schedule.name}
                </Link>
                <p className="mb-0 mt-1 text-[12px] leading-5 text-fg-muted">
                  {t("removed", { count: schedule.removedTargets })}
                </p>
                <p className="m-0 text-[12px] leading-5 text-fg">
                  {schedule.remainingTargets === 0
                    ? t("becomesEmpty")
                    : t("remaining", { count: schedule.remainingTargets })}
                </p>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px] leading-5 text-fg-muted">{t("kept")}</p>
        </>
      ) : (
        <p className="m-0 text-[12px] leading-5 text-fg-muted">{t("noSchedules")}</p>
      )}
      <p className="m-0 text-[12px] leading-5 text-fg-muted">{t("running")}</p>
    </div>
  );
}
