import { positionTargetAnnotation } from "@/lib/keywords/position-history";
import { chartColors } from "@/lib/theme/chart-colors";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { useDrawingArea, useXScale, useYScale } from "@mui/x-charts/hooks";

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
  const { top } = useDrawingArea();
  const yScale = useYScale();
  const position = yScale(target);
  const labelBelow = typeof position === "number" && position - top < 14;

  return (
    <ChartsReferenceLine
      label={`TARGET #${target}`}
      labelAlign="start"
      labelStyle={{
        fill: "var(--fg-muted)",
        fontFamily: "var(--font-mono), monospace",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.5px",
      }}
      lineStyle={{
        stroke: chartColors.green,
        strokeDasharray: "4 3",
        strokeWidth: 1,
      }}
      spacing={{ x: 0, y: labelBelow ? -14 : 4 }}
      y={target}
    />
  );
}

export function LatestPositionAnnotation({
  labels,
  positions,
  target,
}: Readonly<{ labels: string[]; positions: number[]; target: number }>) {
  const { height, left, top, width } = useDrawingArea();
  const xScale = useXScale<"point">();
  const yScale = useYScale<"linear">();
  const position = positions.at(-1);
  const label = labels.at(-1);
  if (position === undefined || label === undefined) return null;
  const markerX = xScale(label);
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
        fontFamily="var(--font-mono), monospace"
        fontSize={10}
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
