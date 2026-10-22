"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { type DateDisplayContext, formatDisplayDate } from "@/lib/dates/format";
import { useTranslations } from "next-intl";
import type { TrendPoint } from "./types";

const visibleKeywordLimit = 5;

type RankedKeyword = TrendPoint["rankedKeywords"][number];
type PositionTrendCopy = ReturnType<typeof useTranslations<"projectDashboard.positionTrend">>;
type DeviceCopy = ReturnType<typeof useTranslations<"projectDashboard.headerContext">>;

function dateLabel(point: TrendPoint, nowLabel: string, dateDisplay: DateDisplayContext) {
  if (point.label === null) return nowLabel;
  if (!point.dateKey) return point.label ?? "";
  return formatDisplayDate(point.dateKey, dateDisplay);
}

function deviceName(device: string, devices: DeviceCopy) {
  return device.toLowerCase() === "mobile" ? devices("mobile") : devices("desktop");
}

function keywordLine(
  row: RankedKeyword,
  visible: readonly RankedKeyword[],
  t: PositionTrendCopy,
  devices: DeviceCopy,
) {
  const sameText = visible.filter((item) => item.keyword === row.keyword);
  if (sameText.length < 2) {
    return t("tooltipKeyword", { keyword: row.keyword, position: row.position });
  }
  const marketsDiffer = new Set(sameText.map((item) => item.market)).size > 1;
  return t("tooltipKeywordQualified", {
    device: deviceName(row.device, devices),
    hasMarket: marketsDiffer ? "true" : "false",
    keyword: row.keyword,
    market: row.market,
    position: row.position,
  });
}

export function PositionTrendTooltip({ point }: { point: TrendPoint }) {
  const t = useTranslations("projectDashboard.positionTrend");
  const devices = useTranslations("projectDashboard.headerContext");
  const dateDisplay = useDateDisplay();
  if (point.value === null) return null;
  const visible = point.rankedKeywords.slice(0, visibleKeywordLimit);
  const hidden = point.rankedKeywordCount - visible.length;
  return (
    <div className="flex flex-col gap-1 font-sans tabular-nums">
      <p className="font-medium">{dateLabel(point, t("now"), dateDisplay)}</p>
      <p>{t("tooltipAverage", { position: point.value })}</p>
      {visible.length > 0 ? (
        <ul className="m-0 list-none p-0">
          {visible.map((row, index) => (
            <li
              className="text-fg-muted"
              key={`${row.keyword}-${row.device}-${row.market}-${row.position}-${index}`}
            >
              {keywordLine(row, visible, t, devices)}
            </li>
          ))}
        </ul>
      ) : null}
      {hidden > 0 ? <p>{t("tooltipMore", { count: hidden })}</p> : null}
    </div>
  );
}
