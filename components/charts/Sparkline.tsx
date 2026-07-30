"use client";

import { SparkLineChart } from "@mui/x-charts/SparkLineChart";

export type SparklineProps = {
  ariaLabel: string;
  color?: string;
  data: readonly (number | null)[];
  height?: number;
  responsive?: boolean;
  valueFormatter?: (value: number | null) => string;
  width?: number;
};

export function Sparkline({
  ariaLabel,
  color = "var(--accent)",
  data,
  height = 34,
  responsive = false,
  valueFormatter,
  width = 92,
}: Readonly<SparklineProps>) {
  const points = data.flatMap((value, index) => (value == null ? [] : [{ index, value }]));

  return (
    <span
      aria-label={ariaLabel}
      className="block min-w-0"
      role="img"
      style={{ height, width: responsive ? "100%" : width }}
    >
      <SparkLineChart
        color={color}
        curve="linear"
        data={points.map((point) => point.value)}
        height={height}
        margin={{ top: 6, right: 4, bottom: 6, left: 4 }}
        showTooltip
        valueFormatter={valueFormatter}
        width={responsive ? undefined : width}
        xAxis={{ data: points.map((point) => point.index), scaleType: "linear" }}
      />
    </span>
  );
}
