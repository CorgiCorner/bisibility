"use client";

import { type RankTrackerTab, rankTrackerTabPath } from "@/lib/routing/app-path";
import { cn } from "@/lib/ui/cn";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

type RankTrackerTabsProps = {
  activeTab: RankTrackerTab;
  runsCount?: number;
  projectRef: string;
  savedCount: number;
  trackedCount: number;
};

function countChip() {
  return "rounded-control bg-bg-sunken px-[7px] py-0.5 font-sans tabular-nums text-[11px] text-fg-muted";
}

function tabClass(active: boolean) {
  return cn(
    "-mb-px flex items-center gap-2 border-b-2 px-3.5 py-[9px] text-[13.5px] transition-colors",
    active
      ? "border-accent font-semibold text-fg"
      : "border-transparent text-fg-muted hover:text-fg",
  );
}

export function RankTrackerTabs({
  activeTab,
  projectRef,
  savedCount,
  trackedCount,
}: Readonly<RankTrackerTabsProps>) {
  const format = useFormatter();
  const t = useTranslations("projectRankTracker.tabs");
  const trackedActive = activeTab === "tracked";
  const savedActive = activeTab === "saved";

  return (
    <nav aria-label={t("navigationAriaLabel")} className="flex gap-1 border-b border-border">
      <Link
        aria-current={trackedActive ? "page" : undefined}
        aria-label={t("trackedAriaLabel", { count: trackedCount })}
        className={tabClass(trackedActive)}
        href={rankTrackerTabPath(projectRef, "tracked")}
      >
        <span>{t("tracked")}</span>
        <span className={countChip()}>{format.number(trackedCount)}</span>
      </Link>
      <Link
        aria-current={savedActive ? "page" : undefined}
        aria-label={t("savedAriaLabel", { count: savedCount })}
        className={tabClass(savedActive)}
        href={rankTrackerTabPath(projectRef, "saved")}
      >
        <span>{t("saved")}</span>
        <span className={countChip()}>{format.number(savedCount)}</span>
      </Link>
    </nav>
  );
}
