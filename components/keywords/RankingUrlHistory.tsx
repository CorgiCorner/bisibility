"use client";

import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { KeywordRow, RankingUrlEvent } from "@/lib/queries/keywords";
import { rankObservationState } from "@/lib/serp/rank-depth";
import { MinusIcon as Minus } from "@phosphor-icons/react/dist/ssr/Minus";
import { WarningIcon as Warning } from "@phosphor-icons/react/dist/ssr/Warning";
import { useLocale, useTranslations } from "next-intl";
import { RankingUrlExternalLink } from "./RankingUrlExternalLink";

type TimelineEvent = RankingUrlEvent & { changed: boolean };

function pathFromUrl(value: string) {
  if (value.startsWith("/")) {
    return value;
  }
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}

// History arrives oldest-first. A changed period has a different URL than its predecessor.
function buildTimeline(history: RankingUrlEvent[]): TimelineEvent[] {
  return history
    .map((event, index) => ({
      ...event,
      changed: index > 0 && history[index - 1]?.url !== event.url,
    }))
    .reverse();
}

function periodDateRange(event: RankingUrlEvent, locale: string) {
  const startAt = event.startAt.slice(0, 10);
  const formatDay = (day: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${day}T00:00:00.000Z`),
    );
  return {
    current: event.isCurrent,
    end: event.isCurrent ? null : formatDay(event.endAt.slice(0, 10)),
    start: formatDay(startAt),
  };
}

function positionLabel(event: RankingUrlEvent) {
  const trackedDepth =
    event.requestedDepth ??
    (typeof event.position === "number" && event.position > 0 ? event.position : undefined);
  return rankObservationState({
    completedChecks: 1,
    position: event.position,
    trackedDepth,
  }).label;
}

export function RankingUrlHistory({ keyword }: Readonly<{ keyword: KeywordRow }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.rankingUrl");
  const locale = useLocale();
  const timeline = buildTimeline(keyword.rankingUrlHistory);
  const urlChanges = timeline.filter((event) => event.changed).length;
  const changeState = timeline.length < 2 ? "first_check" : urlChanges > 0 ? "diff" : "no_change";

  return (
    <Card className="overflow-visible rounded-card p-0" size="lg">
      <div className="border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SectionTitle>{t("title")}</SectionTitle>
            <InfoTooltip text={t("historyTip")} />
            {changeState === "diff" ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full border border-yellow px-2 font-sans tabular-nums text-[10.5px] font-semibold text-yellow-text">
                <Warning size={11} weight="regular" />
                {t("urlChanged")}
              </span>
            ) : null}
            {changeState === "no_change" ? (
              <span className="inline-flex items-center gap-1 font-sans tabular-nums text-[10.5px] text-fg-muted">
                <Minus size={12} weight="regular" />
                {t("noChange")}
              </span>
            ) : null}
          </div>
          <p className="m-0 mt-1 text-[12px] text-fg-muted">
            {t("description", { positionTip: t("positionTip") })}
          </p>
        </div>
      </div>
      <div>
        {timeline.length ? (
          timeline.map((event, index) => (
            <div
              className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 border-b border-border px-5 py-[13px] last:border-b-0 sm:grid-cols-[18px_108px_minmax(0,1fr)_auto]"
              data-testid="ranking-url-period"
              key={`${event.startAt}-${event.endAt}-${event.url}-${index}`}
            >
              <span className="col-start-1 row-start-1 flex w-[18px] flex-none justify-center">
                <span
                  className={`h-[9px] w-[9px] rounded-full ${
                    event.isCurrent
                      ? "bg-accent-solid"
                      : "border-[1.5px] border-border bg-transparent"
                  }`}
                />
              </span>
              <span className="col-start-2 row-start-1 w-[108px] text-fg-muted">
                {(() => {
                  const period = periodDateRange(event, locale);
                  return period.current
                    ? t("currentPeriod", { now: t("now"), start: period.start })
                    : t("period", { end: period.end ?? period.start, start: period.start });
                })()}
              </span>
              <div className="col-span-2 col-start-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
                  <RankingUrlExternalLink href={event.url} path={pathFromUrl(event.url)} />
                  {event.isCurrent ||
                  index === timeline.length - 1 ||
                  (event.changed && event.note === "URL switched") ? (
                    <span className="max-w-[200px] truncate text-[11.5px] text-fg-muted">
                      {event.isCurrent
                        ? t("currentPage")
                        : index === timeline.length - 1
                          ? t("firstIndexed")
                          : t("urlSwitched")}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="col-start-3 row-start-1 flex flex-none items-center gap-[7px] sm:col-start-4">
                <span className="font-sans tabular-nums text-[13px] font-semibold text-fg">
                  {positionLabel(event)}
                </span>
              </span>
            </div>
          ))
        ) : (
          <div className="px-5 py-8 text-center">
            <p className="m-0 text-[13px] font-semibold text-fg">{t("emptyTitle")}</p>
            <p className="m-0 mt-1 text-[12px] text-fg-muted">{t("emptyDescription")}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
