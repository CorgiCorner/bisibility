import { positionTargetAnnotation } from "@/lib/keywords/position-history";
import { ReferenceLine, usePlotArea, useXAxisScale, useYAxisScale } from "recharts";

export function historyAnnotationTop({
  bottom,
  latest,
  previous,
  target,
  top,
}: {
  bottom: number;
  latest: number;
  previous: number | null;
  target: number | null;
  top: number;
}) {
  const height = 18;
  const aboveIsClear = previous !== null && previous - latest >= height;
  const belowIsClear = previous !== null && latest - previous >= height;
  let placeAbove = aboveIsClear && !belowIsClear;
  if (placeAbove && latest - height - 4 < top) placeAbove = false;
  if (!placeAbove && latest + height + 4 > bottom) placeAbove = true;
  let chipTop = placeAbove ? latest - height - 4 : latest + 4;
  if (target !== null && target >= chipTop - 1 && target <= chipTop + height + 1) {
    chipTop += placeAbove ? -12 : 12;
  }
  return chipTop;
}

export function TargetReferenceLine({ target }: Readonly<{ target: number }>) {
  const area = usePlotArea();
  const yScale = useYAxisScale();
  if (!area || !yScale) return null;
  const position = yScale(target);
  const labelBelow = typeof position === "number" && position - area.y < 14;
  return (
    <ReferenceLine
      y={target}
      stroke="var(--green)"
      strokeDasharray="4 3"
      label={{
        value: `TARGET #${target}`,
        position: labelBelow ? "insideBottomLeft" : "insideTopLeft",
        fill: "var(--fg-muted)",
        fontSize: 10,
        fontWeight: 600,
      }}
    />
  );
}

export function LatestPositionAnnotation({
  labels,
  positions,
  target,
}: Readonly<{ labels: string[]; positions: number[]; target: number }>) {
  const area = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!area || !xScale || !yScale) return null;
  const { height, x: left, y: top, width } = area;
  const position = positions.at(-1);
  const label = labels.at(-1);
  if (position === undefined || label === undefined) return null;
  const markerX = xScale(labels.length - 1);
  const markerY = yScale(position);
  const previousPosition = positions.at(-2);
  const previousY = previousPosition === undefined ? null : yScale(previousPosition);
  const targetY = yScale(target);
  if (typeof markerX !== "number" || typeof markerY !== "number") return null;

  const copy = positionTargetAnnotation(position, target);
  const chipWidth = Math.min(copy.length * 6 + 10, width - 24);
  const chipRight = left + width - 12;
  const chipTop = historyAnnotationTop({
    bottom: top + height,
    latest: markerY,
    previous: typeof previousY === "number" ? previousY : null,
    target: typeof targetY === "number" ? targetY : null,
    top,
  });
  return (
    <g aria-hidden>
      <circle
        cx={markerX}
        cy={markerY}
        fill="var(--accent)"
        r={4}
        stroke="var(--bg-elev)"
        strokeWidth={2}
      />
      <rect
        fill="var(--bg-elev)"
        height={18}
        rx={4}
        stroke="var(--border)"
        width={chipWidth}
        x={chipRight - chipWidth}
        y={chipTop}
      />
      <text
        fill="var(--fg-muted)"
        fontFamily="var(--font-sans), system-ui, sans-serif"
        fontSize={10}
        style={{ fontVariantNumeric: "tabular-nums" }}
        fontWeight={400}
        textAnchor="end"
        x={chipRight - 5}
        y={chipTop + 12}
      >
        {copy}
      </text>
    </g>
  );
}
