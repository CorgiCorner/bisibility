import { journeyFrameMessage } from "@/lib/challenge-report/journey-frame";
import { CHALLENGE_TILE_IDS } from "@/lib/challenge-report/tile-state";
import { formatDisplayDate } from "@/lib/dates/format";
import type { useTranslations } from "next-intl";
import { formatPublicNumber } from "./format";
import { shareImageCopy } from "./image-facts";
import type { PublicReport } from "./projection";

export function reportCardContent(
  input: { domain: string; title: string; view: PublicReport },
  t: ReturnType<typeof useTranslations<"challengeReport">>,
  locale: string,
  timeZone: string,
) {
  const copy = shareImageCopy(input.view, locale);
  const { period, journey, tiles } = input.view;
  const dates = { locale, timeZone, dateFormat: "month_first" as const };
  const day = t("period", {
    days: period.days,
    from: formatDisplayDate(period.from, dates),
    to: formatDisplayDate(period.to, dates),
  });
  const clicks =
    copy.headlineTile === "clicks" && tiles.clicks?.state === "ok" ? tiles.clicks : null;
  const change = clicks?.percentChange;
  const detail =
    change !== null &&
    change !== undefined &&
    clicks?.previousSeries.some((point) => point.clicks !== null)
      ? t("clicksDelta", {
          change: new Intl.NumberFormat(locale, {
            maximumFractionDigits: 0,
            signDisplay: "exceptZero",
            style: "percent",
          }).format(change / 100),
          days: period.days,
        })
      : undefined;
  const facts = Object.fromEntries(CHALLENGE_TILE_IDS.map((id) => [id, t(`tiles.${id}`)]));
  Object.assign(facts, {
    clicks: t("card.clicks"),
    existingVsNew: t("card.newPages"),
    topPages: t("card.topPages"),
  });
  const defaultTitle =
    input.title === t("performanceTitle", { domain: input.domain }) ||
    input.title === t("journeyTitle", { domain: input.domain });
  return {
    copy: { ...copy, headline: copy.headline || t("stateNoData") },
    labels: {
      comparison: copy.comparison && {
        change:
          copy.comparison.delta === 0
            ? t("card.noChange")
            : t("card.netChange", {
                change: `${copy.comparison.delta > 0 ? "+" : ""}${formatPublicNumber(copy.comparison.delta, input.view.roundNumbers, locale)}`,
              }),
        latest: t("card.latest"),
        start: t("card.start"),
      },
      clickTrend: clicks?.bucketDays
        ? t("clickBuckets", { days: clicks.bucketDays })
        : t("card.dailyClicks"),
      day,
      detail,
      facts,
      headline: copy.headlineTile ? facts[copy.headlineTile] : "",
    },
    title: journey
      ? `${t("journeyName")} · ${frameText(journey, t)}`
      : defaultTitle
        ? t("card.performance")
        : input.title,
  };
}

function frameText(
  journey: NonNullable<PublicReport["journey"]>,
  t: ReturnType<typeof useTranslations<"challengeReport">>,
) {
  const frame = journeyFrameMessage(journey);
  return frame.key === "journeyFrame"
    ? t("journeyFrame", frame.values)
    : t("journeyFrameCheckIns", frame.values);
}
