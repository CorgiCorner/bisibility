import type { PositionObservation } from "@/lib/checks/position-observations";
import type { KeywordLocation } from "@/lib/queries/keywords";
import { useLocale, useTranslations } from "next-intl";
import { useXAxisScale, useYAxisScale } from "recharts";

function countryName(countryCode: string, locale: string) {
  if (!countryCode) return countryCode;
  return new Intl.DisplayNames([locale], { type: "region" }).of(countryCode) ?? countryCode;
}

export function DegradedPositionMarkers({
  color,
  labels,
  location,
  points,
}: Readonly<{
  color: string;
  labels: readonly string[];
  location: KeywordLocation;
  points: readonly PositionObservation[];
}>) {
  const locale = useLocale();
  const t = useTranslations("projectRankTracker.keywordDetail.position");
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;
  const copy = t("degradedMarker", {
    country: countryName(location.countryCode, locale),
    requested: location.cityName ?? location.displayName,
  });
  return points.flatMap((point) => {
    if (!point.degradedToCountry || point.position === null) return [];
    const x = xScale(labels.indexOf(point.label));
    const y = yScale(point.position);
    if (typeof x !== "number" || typeof y !== "number") return [];
    return [
      <g aria-label={copy} key={`${point.checkedAt}-${point.position}`}>
        <title>{copy}</title>
        <circle
          cx={x}
          cy={y}
          fill="var(--bg-elev)"
          r={5}
          stroke={color}
          strokeDasharray="2 2"
          strokeWidth={2}
        />
      </g>,
    ];
  });
}
