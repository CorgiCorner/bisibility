import type { KeywordLocation, PositionPoint } from "@/lib/queries/keywords";
import { useXAxisScale, useYAxisScale } from "recharts";

function countryName(countryCode: string) {
  if (!countryCode) return "the country";
  return new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? countryCode;
}

export function degradedPositionCopy(location: KeywordLocation) {
  const country = countryName(location.countryCode);
  const requested = location.cityName ?? location.displayName;
  return `Checked at country level - the provider had no handle for this city. Position measured for ${country}, not ${requested}.`;
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
  points: readonly PositionPoint[];
}>) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;
  const copy = degradedPositionCopy(location);
  return points.flatMap((point) => {
    if (!point.degradedToCountry) return [];
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
