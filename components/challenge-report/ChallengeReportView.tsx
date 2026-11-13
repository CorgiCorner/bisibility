"use client";

import {
  challengeReportBlocks,
  challengeReportLayoutClassName,
} from "@/components/agent-reports/challenge-report-layout";
import { Card } from "@/components/ui/Card";
import { ChallengeBento, ChallengeBentoItem } from "@/lib/challenge-report/bento";
import { challengeBentoLayout } from "@/lib/challenge-report/bento-layout";
import { type ChallengeReportBody, lessonEntries } from "@/lib/challenge-report/schema";
import { CHALLENGE_TILE_IDS, type ChallengeTileId } from "@/lib/challenge-report/tile-state";
import { formatDisplayDate } from "@/lib/dates/format";
import { TileMotion } from "@/lib/report-sharing/tile-motion";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CostTile, TopPagesTile } from "./ChallengeReportLists";
import { ActiveDaysTile, AiTile } from "./ChallengeReportMeters";
import { ClicksTile, ConversionsTile, ExistingTile, Top10Tile } from "./ChallengeReportTiles";
import { usePublicReportMotion } from "./use-public-report-motion";

export type ChallengeReportViewBody = {
  lessons: ChallengeReportBody["lessons"] | null;
  period: ChallengeReportBody["period"];
  sources: ChallengeReportBody["sources"];
  stage: ChallengeReportBody["stage"];
  tiles: Partial<ChallengeReportBody["tiles"]>;
};

export function ChallengeReportPeriod({
  period,
}: Readonly<{ period: ChallengeReportViewBody["period"] }>) {
  const t = useTranslations("challengeReport");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "UTC";
  const dates = { dateFormat: "month_first" as const, locale, timeZone };
  return (
    <p className="m-0 text-ui-body text-fg-muted">
      {t("period", {
        days: period.days,
        from: formatDisplayDate(period.from, dates),
        to: formatDisplayDate(period.to, dates),
      })}
    </p>
  );
}

export function ChallengeReportView({
  body,
  lessonSlot,
  motion = false,
  projectId,
  showPeriod = true,
}: Readonly<{
  body: ChallengeReportViewBody;
  lessonSlot?: ReactNode;
  motion?: boolean;
  projectId?: string;
  showPeriod?: boolean;
}>) {
  const t = useTranslations("challengeReport");
  const animate = usePublicReportMotion();
  const tiles = CHALLENGE_TILE_IDS.filter((id) => {
    const tile = body.tiles[id];
    return tile && !(tile.state !== "ok" && tile.reason === "activity_hidden");
  });
  const written = body.lessons
    ? lessonEntries(body.lessons, t).filter(({ answer }) => answer.trim())
    : [];
  return (
    <div
      className={challengeReportLayoutClassName}
      data-challenge-blocks={challengeReportBlocks.join(" ")}
    >
      {showPeriod ? <ChallengeReportPeriod period={body.period} /> : null}
      <ChallengeBento>
        {challengeBentoLayout(tiles).map((span, index) => (
          <ChallengeBentoItem key={span.id} span={span}>
            <TileMotion active={motion && animate} index={index}>
              <TileBody body={body} id={span.id} projectId={projectId} />
            </TileMotion>
          </ChallengeBentoItem>
        ))}
      </ChallengeBento>
      {lessonSlot ? (
        <Card className="grid gap-4 p-4">{lessonSlot}</Card>
      ) : written.length ? (
        <Card className="grid gap-4 p-4">
          <h2 className="m-0 text-ui-section">{t("lessonsTitle")}</h2>
          <div className="grid gap-4">
            {written.map(({ question, answer }, index) => (
              <div className="grid min-w-0 gap-1" key={index}>
                <h3 className="m-0 wrap-anywhere text-ui-body">{question}</h3>
                <p className="m-0 whitespace-pre-wrap wrap-anywhere text-ui-body text-fg-muted">
                  {answer}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      <Card className="grid gap-2 p-4">
        <h2 className="m-0 text-ui-section">{t("footnoteTitle")}</h2>
        <p className="m-0 text-ui-caption text-fg-muted">{t("footnoteBody")}</p>
        {body.sources.length ? (
          <p className="m-0 text-ui-caption text-fg-muted">
            {t("sourcesLead")}: {body.sources.map((source) => t(`sources.${source}`)).join(", ")}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function TileBody({
  body,
  id,
  projectId,
}: Readonly<{ body: ChallengeReportViewBody; id: ChallengeTileId; projectId?: string }>) {
  const days = body.period.days;
  switch (id) {
    case "activeDays":
      return body.tiles.activeDays ? <ActiveDaysTile tile={body.tiles.activeDays} /> : null;
    case "aiAnswers":
      return body.tiles.aiAnswers ? <AiTile tile={body.tiles.aiAnswers} /> : null;
    case "clicks":
      return body.tiles.clicks ? (
        <ClicksTile days={days} projectId={projectId} tile={body.tiles.clicks} />
      ) : null;
    case "conversions":
      return body.tiles.conversions ? <ConversionsTile tile={body.tiles.conversions} /> : null;
    case "cost":
      return body.tiles.cost ? <CostTile tile={body.tiles.cost} /> : null;
    case "existingVsNew":
      return body.tiles.existingVsNew ? <ExistingTile tile={body.tiles.existingVsNew} /> : null;
    case "top10":
      return body.tiles.top10 ? <Top10Tile tile={body.tiles.top10} /> : null;
    case "topPages":
      return body.tiles.topPages ? <TopPagesTile tile={body.tiles.topPages} /> : null;
    default:
      return null;
  }
}
