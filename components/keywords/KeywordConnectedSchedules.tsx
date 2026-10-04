"use client";

import { keywordScheduleTarget } from "@/lib/keywords/schedule-targets";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useTranslations } from "next-intl";
import { ScheduleCell } from "./grid/ScheduleCell";

export function KeywordConnectedSchedules({
  keyword,
  targets,
  projectRef,
  onChange,
}: Readonly<{
  keyword: KeywordRow;
  targets?: readonly KeywordRow[];
  projectRef?: string;
  onChange?: () => void;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.header");
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-t border-border pt-3">
      <div className="grid gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          {t("connectedSchedule")}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <ScheduleCell projectRef={projectRef} targets={[keywordScheduleTarget(keyword)]} />
          {onChange ? (
            <button
              className="text-[12px] font-semibold text-accent-text hover:underline"
              onClick={onChange}
              type="button"
            >
              {keyword.checkSchedule ? t("changeSchedule") : t("setSchedule")}
            </button>
          ) : null}
        </div>
      </div>
      {targets && targets.length > 1 ? (
        <div className="grid gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
            {t("schedulesAllTargets")}
          </span>
          <ScheduleCell projectRef={projectRef} targets={targets.map(keywordScheduleTarget)} />
        </div>
      ) : null}
    </div>
  );
}
