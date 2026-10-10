"use client";

import { buildGoogleSerpUrl } from "@/components/keywords/filters/DimensionSwitcher";
import { Card } from "@/components/ui/Card";
import { IdChip } from "@/components/ui/IdChip";
import { useBrowserTimeZone } from "@/components/ui/ZonedTime";
import type { KeywordDetailRankState } from "@/lib/keyword-detail/state-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { KeywordCheckScope } from "./KeywordCheckScope";
import { KeywordConnectedSchedules } from "./KeywordConnectedSchedules";
import { KeywordDetailHeaderSlot } from "./KeywordDetailHeaderSlot";
import { KeywordIndexStatus } from "./KeywordIndexStatus";
import { KeywordSearchMetrics } from "./KeywordSearchMetrics";
import {
  compactDate,
  keywordChips,
  lastCheckLabel,
  pathLabel,
} from "./keyword-detail-header-format";
import { metadataChipClassName } from "./keyword-header-model";

type KeywordDetailHeaderChromeProps = {
  actions: ReactNode;
  keyword: KeywordRow;
  scheduleTargets?: readonly KeywordRow[];
  projectRef?: string;
  onChangeSchedule?: () => void;
  providerLabel?: string | null;
  rankState?: KeywordDetailRankState;
  searchConsoleConnected?: boolean;
  timeZone: string;
};

export function KeywordDetailHeaderChrome({
  actions,
  keyword,
  scheduleTargets,
  projectRef,
  onChangeSchedule,
  providerLabel,
  rankState = "normal",
  searchConsoleConnected = false,
  timeZone,
}: Readonly<KeywordDetailHeaderChromeProps>) {
  const t = useTranslations("projectRankTracker.keywordDetail");
  const locale = useLocale();
  const browserTimeZone = useBrowserTimeZone();
  const currentRankingUrl = rankState === "normal" ? keyword.rankingUrl : null;
  const expectedUrl =
    keyword.currentExpectedUrl !== undefined
      ? keyword.currentExpectedUrl
      : (keyword.expectedUrl ?? keyword.targetUrl);
  const expectedUrlDetail = [
    t("header.expectedForMarket", { path: pathLabel(expectedUrl, t("common.notAvailable")) }),
    expectedUrl && keyword.expectedUrlSource
      ? t("header.expectedSource", { source: keyword.expectedUrlSource })
      : null,
  ]
    .filter(Boolean)
    .join(" ");
  const liveSerpHref = buildGoogleSerpUrl(keyword.keyword, keyword.location);
  const previousCheck = keyword.completedComparableChecks?.at(-2);
  const projectDepth = resolveSerpDepth(keyword.trackedDepth ?? keyword.projectSerpDepth);
  const previousPositionDetail =
    previousCheck?.position === null || previousCheck === undefined
      ? null
      : t("header.versusPrevious", {
          date: compactDate(previousCheck.checkedAt, locale, timeZone, t),
          position: previousCheck.position,
        });
  const bestPositionDetail =
    keyword.bestPosition === null
      ? null
      : t("header.bestInPeriod", { position: keyword.bestPosition });
  const positionDetail =
    rankState === "not_ranked"
      ? t("header.trackedSince", { date: compactDate(keyword.createdAt, locale, timeZone, t) })
      : previousCheck
        ? [previousPositionDetail, bestPositionDetail]
            .filter((detail) => detail !== null)
            .join(" · ")
        : (bestPositionDetail ?? "");
  const chips = keywordChips(keyword);
  const position =
    rankState === "unknown"
      ? t("header.coverageUnknown")
      : rankState === "not_ranked"
        ? t("header.notRanked")
        : keyword.hasRankData
          ? keyword.position === null
            ? t("common.noData")
            : t("header.positionValue", { position: keyword.position })
          : t("common.noData");
  const positionState = rankState === "normal" && keyword.hasRankData ? "numeric" : "textual";

  return (
    <Card className="rounded-card" size="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h1 className="m-0 min-w-0 text-[23px] font-semibold leading-tight tracking-[-0.6px] text-fg">
            {keyword.keyword}
          </h1>
          <IdChip className="border-border bg-transparent" size="xs" value={keyword.id} />
        </div>
        {actions}
      </div>
      <div className="mt-3">
        <KeywordCheckScope keyword={keyword} />
      </div>
      {chips.topic || chips.intent || chips.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-[7px]">
          {chips.topic ? (
            <span className={metadataChipClassName}>
              {t("header.topic", { value: chips.topic })}
            </span>
          ) : null}
          {chips.intent ? (
            <span className={metadataChipClassName}>
              {t("header.intent", { value: chips.intent })}
            </span>
          ) : null}
          {chips.tags.map((tag) => (
            <span className={metadataChipClassName} key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div
        aria-label={t("header.ariaLabel")}
        className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]"
      >
        <KeywordDetailHeaderSlot
          detail={
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {keyword.hasRankData || rankState === "not_ranked" ? (
                <span>{t("header.checkedDepth", { depth: projectDepth })}</span>
              ) : null}
              <span>{positionDetail}</span>
            </div>
          }
          label={t("header.position")}
          prominent
          state={positionState}
        >
          {position}
        </KeywordDetailHeaderSlot>
        <KeywordDetailHeaderSlot
          detail={
            <span>
              {expectedUrlDetail} ·{" "}
              <a
                className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline"
                href={liveSerpHref}
                rel="noreferrer noopener"
                target="_blank"
              >
                {t("header.viewSerp")} <ArrowUpRight aria-hidden size={9} weight="regular" />
              </a>
            </span>
          }
          label={t("header.rankingUrl")}
          state="textual"
        >
          {currentRankingUrl ? (
            <a
              className="flex min-w-0 items-center gap-1 text-[12.5px] font-semibold text-fg hover:text-accent-text hover:underline"
              href={currentRankingUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              <span className="truncate">
                {pathLabel(currentRankingUrl, t("common.notAvailable"))}
              </span>
              <ArrowUpRight aria-hidden className="shrink-0" size={10} weight="regular" />
            </a>
          ) : (
            t("header.noRankingUrl")
          )}
        </KeywordDetailHeaderSlot>
        <KeywordDetailHeaderSlot
          detail={
            <span className="flex flex-wrap gap-x-2 gap-y-0.5">
              <span>
                {t("header.provider", {
                  provider: providerLabel ?? keyword.dataProvider ?? t("common.unknown"),
                })}
              </span>
            </span>
          }
          label={t("header.lastCheck")}
          state="textual"
        >
          <span className="font-sans tabular-nums text-[12.5px] font-semibold text-fg">
            {lastCheckLabel(keyword.lastCheckAt, locale, timeZone, browserTimeZone, t)}
          </span>
        </KeywordDetailHeaderSlot>
        <div className="sm:col-span-2 lg:col-span-3">
          <KeywordConnectedSchedules
            keyword={keyword}
            targets={scheduleTargets}
            projectRef={projectRef}
            onChange={onChangeSchedule}
          />
        </div>
      </div>
      <KeywordSearchMetrics keyword={keyword} />
      {searchConsoleConnected ? <KeywordIndexStatus presence={keyword.urlPresence} /> : null}
    </Card>
  );
}
