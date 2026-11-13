"use client";

import { StatTile } from "@/components/ui/StatTile";
import { isoDayKey } from "@/lib/challenge-report/day-key";
import { RatioMeter } from "@/lib/challenge-report/ratio-meter";
import type { ChallengeReportBody } from "@/lib/challenge-report/schema";
import { useTimeZone, useTranslations } from "next-intl";
import { UnavailableTile } from "./ChallengeReportTiles";
import { useReportFigure } from "./report-figures";

type Body = ChallengeReportBody;
type Translator = ReturnType<typeof useTranslations<"challengeReport">>;

function engineName(t: Translator, engine: string) {
  switch (engine) {
    case "chat_gpt":
      return t("engines.chat_gpt");
    case "claude":
      return t("engines.claude");
    case "gemini":
      return t("engines.gemini");
    case "google":
      return t("engines.google");
    case "perplexity":
      return t("engines.perplexity");
    default:
      return engine;
  }
}

function ratioText(t: Translator, figure: (value: number) => string, named: number, total: number) {
  if (named === 0 && total === 0) return t("aiNoDay1");
  return t("aiRatio", { named: figure(named), total: figure(total) });
}

export function ActiveDaysTile({ tile }: Readonly<{ tile: Body["tiles"]["activeDays"] }>) {
  const t = useTranslations("challengeReport");
  const figure = useReportFigure();
  const timeZone = useTimeZone() ?? "UTC";
  if (tile.state !== "ok") {
    return (
      <UnavailableTile label={t("tiles.activeDays")} reason={tile.reason} state={tile.state} />
    );
  }
  const today = isoDayKey(timeZone);
  return (
    <StatTile
      caption={t(tile.scope === "project" ? "scopeProject" : "scopeUser")}
      label={t("tiles.activeDays")}
      value={t("daysOf", { count: figure(tile.activeCount), days: figure(tile.days.length) })}
    >
      <ul aria-label={t("activeBar")} className="m-0 flex list-none gap-px p-0">
        {tile.days.slice(-30).map((day, index, shown) => {
          const kind = day.active ? "done" : day.date > today ? "upcoming" : "skipped";
          const name = t(
            kind === "done" ? "dayDone" : kind === "upcoming" ? "dayUpcoming" : "daySkipped",
            { day: index + 1 + tile.days.length - shown.length },
          );
          return (
            <li className="min-w-0 flex-1" key={day.date}>
              <span
                aria-label={name}
                className={
                  kind === "done"
                    ? "block h-6 rounded-sm bg-accent"
                    : kind === "skipped"
                      ? "block h-6 rounded-sm bg-yellow"
                      : "block h-6 rounded-sm bg-meter-track"
                }
                role="img"
                title={name}
              />
            </li>
          );
        })}
      </ul>
    </StatTile>
  );
}

export function AiTile({ tile }: Readonly<{ tile: Body["tiles"]["aiAnswers"] }>) {
  const t = useTranslations("challengeReport");
  const figure = useReportFigure();
  if (tile.state !== "ok") {
    return <UnavailableTile label={t("tiles.aiAnswers")} reason={tile.reason} state={tile.state} />;
  }
  return (
    <StatTile
      caption={ratioText(t, figure, tile.day1Named, tile.day1Total)}
      label={t("tiles.aiAnswers")}
      source={t("sources.ai_visibility")}
      value={t("aiRatio", { named: figure(tile.named), total: figure(tile.total) })}
    >
      <ul className="m-0 grid list-none gap-2 p-0">
        {tile.engines.map((engine) => {
          const name = engineName(t, engine.engine);
          const reading = t("aiEngineRatio", {
            engine: name,
            named: figure(engine.named),
            total: figure(engine.total),
          });
          return (
            <li className="grid gap-1" key={engine.engine}>
              <span className="flex items-baseline justify-between gap-2 text-ui-caption">
                <span>{name}</span>
                <span className="tabular-nums">
                  {figure(engine.named)}/{figure(engine.total)}
                </span>
              </span>
              <RatioMeter label={reading} max={engine.total} value={engine.named} />
              <span className="text-ui-micro text-fg-muted">
                {ratioText(t, figure, engine.day1Named, engine.day1Total)}
              </span>
            </li>
          );
        })}
      </ul>
    </StatTile>
  );
}
