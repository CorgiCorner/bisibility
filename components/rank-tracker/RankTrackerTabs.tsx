"use client";

import { tabCountClassName, tabTriggerClassName } from "@/components/ui/Tabs";
import { type RankTrackerTab, rankTrackerTabPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

type RankTrackerTabsProps = {
  activeTab: RankTrackerTab;
  runsCount?: number;
  projectRef: string;
  savedCount: number;
  trackedCount: number;
};

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
        className={tabTriggerClassName(trackedActive)}
        href={rankTrackerTabPath(projectRef, "tracked")}
      >
        <span>{t("tracked")}</span>
        <span className={tabCountClassName}>{format.number(trackedCount)}</span>
      </Link>
      <Link
        aria-current={savedActive ? "page" : undefined}
        aria-label={t("savedAriaLabel", { count: savedCount })}
        className={tabTriggerClassName(savedActive)}
        href={rankTrackerTabPath(projectRef, "saved")}
      >
        <span>{t("saved")}</span>
        <span className={tabCountClassName}>{format.number(savedCount)}</span>
      </Link>
    </nav>
  );
}
