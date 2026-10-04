"use client";

import { SectionTitle } from "@/components/ui/SectionTitle";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { KeywordCheckScope } from "./KeywordCheckScope";
import { positionHistoryContentInsets } from "./position-history-layout";

export function PositionHistoryHeader({
  keyword,
  marketLabel,
  latestCheck,
  children,
}: Readonly<{
  keyword: KeywordRow;
  marketLabel?: string;
  latestCheck: string | null;
  children: ReactNode;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.position");
  return (
    <div style={positionHistoryContentInsets}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <SectionTitle>{t("title")}</SectionTitle>
          <KeywordCheckScope keyword={keyword} marketLabel={marketLabel} />
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-3 text-[11px] leading-5 text-fg-muted">
        {!marketLabel ? (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-4 rounded-full bg-accent-solid" />
            {t("recordedPosition")}
          </span>
        ) : null}
        {latestCheck ? (
          <div aria-label={t("latestCheck")} className="flex flex-wrap items-baseline gap-x-2">
            <span>{t("latestCheck")}</span>
            <span className="font-medium text-fg">{latestCheck}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PositionHistoryNotes({
  hasGaps,
  boundaryVisible,
}: Readonly<{ hasGaps: boolean; boundaryVisible: boolean }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.position");
  return (
    <div
      style={positionHistoryContentInsets}
      className="mt-4 space-y-1 border-t border-border pt-3 text-[11px] leading-5 text-fg-muted"
    >
      <p className="m-0">{t("description")}</p>
      {hasGaps ? <p className="m-0">{t("unrankedGaps")}</p> : null}
      {boundaryVisible ? <p className="m-0">{t("normalization")}</p> : null}
    </div>
  );
}
