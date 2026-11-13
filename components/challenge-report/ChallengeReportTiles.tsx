"use client";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { StatTile, type StatTileDirection } from "@/components/ui/StatTile";
import type { ChallengeReportBody } from "@/lib/challenge-report/schema";
import { type DateDisplayContext, formatDisplayDate } from "@/lib/dates/format";
import { useFormatter, useLocale, useTimeZone, useTranslations } from "next-intl";
import { useReportFigure, useReportRound } from "./report-figures";

type Body = ChallengeReportBody;
type Translator = ReturnType<typeof useTranslations<"challengeReport">>;

function reasonText(t: Translator, reason: string) {
  switch (reason) {
    case "activity_off":
      return t("reasons.activity_off");
    case "ai_visibility":
      return t("reasons.ai_visibility");
    case "conversions":
      return t("reasons.conversions");
    case "empty":
      return t("reasons.empty");
    case "no_actor":
      return t("reasons.no_actor");
    case "no_answers":
      return t("reasons.no_answers");
    case "no_checks":
      return t("reasons.no_checks");
    case "no_goals":
      return t("reasons.no_goals");
    case "no_keywords":
      return t("reasons.no_keywords");
    case "no_prompts":
      return t("reasons.no_prompts");
    case "no_snapshot":
      return t("reasons.no_snapshot");
    case "search_console":
      return t("reasons.search_console");
    case "tile_failed":
      return t("reasons.tile_failed");
    default:
      return t("reasons.unknown");
  }
}

export function UnavailableTile({
  label,
  reason,
  state,
}: Readonly<{ label: string; reason: string; state: "no_data" | "not_connected" }>) {
  const t = useTranslations("challengeReport");
  return (
    <StatTile
      caption={reasonText(t, reason)}
      empty
      label={label}
      value={state === "not_connected" ? t("stateNotConnected") : t("stateNoData")}
    />
  );
}

function direction(delta: number): StatTileDirection {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

export function ClicksTile({
  days,
  projectId,
  tile,
}: Readonly<{ days: number; projectId?: string; tile: Body["tiles"]["clicks"] }>) {
  const t = useTranslations("challengeReport");
  const format = useFormatter();
  const figure = useReportFigure();
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "UTC";
  if (tile.state !== "ok") {
    return <UnavailableTile label={t("tiles.clicks")} reason={tile.reason} state={tile.state} />;
  }
  const dates: DateDisplayContext = { dateFormat: "month_first", locale, timeZone };
  const change =
    tile.percentChange === null
      ? null
      : format.number(tile.percentChange / 100, {
          maximumFractionDigits: 0,
          signDisplay: "exceptZero",
          style: "percent",
        });
  return (
    <StatTile
      delta={
        change === null
          ? undefined
          : {
              direction: direction(tile.percentChange ?? 0),
              label: t("clicksDelta", { change, days }),
            }
      }
      label={t("tiles.clicks")}
      source={t("sources.search_console")}
      value={figure(tile.current)}
    >
      <ul
        aria-label={t("legend")}
        className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0"
      >
        <li className="inline-flex items-center gap-1.5 text-ui-caption text-fg-muted">
          <span aria-hidden className="h-2 w-2 rounded-full bg-blue" />
          {t("clicksCurrent")}
        </li>
        <li className="inline-flex items-center gap-1.5 text-ui-caption text-fg-muted">
          <span aria-hidden className="h-2 w-2 rounded-full bg-purple" />
          {t("clicksBefore", { days })}
        </li>
      </ul>
      {tile.bucketDays ? (
        <p className="m-0 text-ui-caption text-fg-muted">
          {t("clickBuckets", { days: tile.bucketDays })}
        </p>
      ) : null}
      <TimeSeriesChart
        dateKeys={tile.currentSeries.map((point) => point.date)}
        formatValue={(value) => figure(value)}
        height={180}
        labels={tile.currentSeries.map((point) => formatDisplayDate(point.date, dates))}
        markerProjectRef={projectId}
        markers={tile.markers}
        series={[
          {
            color: "var(--blue)",
            label: t("clicksCurrent"),
            values: tile.currentSeries.map((point) => point.clicks),
          },
          {
            color: "var(--purple)",
            label: t("clicksBefore", { days }),
            values: tile.currentSeries.map(
              (_, index) => tile.previousSeries[index]?.clicks ?? null,
            ),
          },
        ]}
      />
    </StatTile>
  );
}

function counted(
  t: Translator,
  figure: (value: number) => string,
  round: boolean,
  key: "clickCount" | "pageCount",
  value: number,
) {
  return round && value >= 1000
    ? t(key === "clickCount" ? "clickCountCompact" : "pageCountCompact", { count: figure(value) })
    : t(key, { count: value });
}

export function ExistingTile({ tile }: Readonly<{ tile: Body["tiles"]["existingVsNew"] }>) {
  const t = useTranslations("challengeReport");
  const figure = useReportFigure();
  const round = useReportRound();
  if (tile.state !== "ok") {
    return (
      <UnavailableTile label={t("tiles.existingVsNew")} reason={tile.reason} state={tile.state} />
    );
  }
  const existingPages = counted(t, figure, round, "pageCount", tile.existingPages);
  const newPages = counted(t, figure, round, "pageCount", tile.newPages);
  return (
    <StatTile
      label={t("tiles.existingVsNew")}
      source={t("sources.pages")}
      value=""
      valueNode={
        <span className="grid grid-cols-2 gap-3">
          <span>
            <span className="block text-ui-h1 tabular-nums text-fg">
              {figure(tile.existingClicks)}
            </span>
            <span className="block text-ui-caption text-fg-muted">{existingPages}</span>
          </span>
          <span>
            <span className="block text-ui-h1 tabular-nums text-fg">{figure(tile.newClicks)}</span>
            <span className="block text-ui-caption text-fg-muted">{newPages}</span>
          </span>
        </span>
      }
    />
  );
}

export function Top10Tile({ tile }: Readonly<{ tile: Body["tiles"]["top10"] }>) {
  const t = useTranslations("challengeReport");
  const figure = useReportFigure();
  if (tile.state !== "ok") {
    return <UnavailableTile label={t("tiles.top10")} reason={tile.reason} state={tile.state} />;
  }
  return (
    <StatTile
      caption={
        tile.bestJump
          ? t("top10Jump", {
              from: figure(tile.bestJump.from),
              keyword: tile.bestJump.keyword,
              to: figure(tile.bestJump.to),
            })
          : t("top10NoJump")
      }
      label={t("tiles.top10")}
      source={t("sources.rank_tracker")}
      value={figure(tile.endCount)}
    >
      {(tile.hasStart ?? tile.startCount > 0) && (
        <p className="m-0 text-ui-caption text-fg-muted">
          {t("top10Start")}: {figure(tile.startCount)}
        </p>
      )}
    </StatTile>
  );
}

export function ConversionsTile({ tile }: Readonly<{ tile: Body["tiles"]["conversions"] }>) {
  const t = useTranslations("challengeReport");
  const format = useFormatter();
  const figure = useReportFigure();
  if (tile.state !== "ok") {
    return (
      <UnavailableTile label={t("tiles.conversions")} reason={tile.reason} state={tile.state} />
    );
  }
  const delta = tile.current - tile.previous;
  return (
    <StatTile
      caption={tile.goals.length ? tile.goals.join(", ") : undefined}
      delta={{
        direction: direction(delta),
        label: t("conversionsDelta", {
          change: format.number(delta, { maximumFractionDigits: 0, signDisplay: "exceptZero" }),
        }),
      }}
      label={t("tiles.conversions")}
      source={t("sources.conversions")}
      value={figure(tile.current)}
    />
  );
}
