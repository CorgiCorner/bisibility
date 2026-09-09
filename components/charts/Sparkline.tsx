"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
      <ResponsiveContainer
        width="100%"
        height={height}
        initialDimension={{ width, height }}
        minWidth={0}
      >
        <LineChart
          data={points}
          margin={{ top: 6, right: 4, bottom: 6, left: 4 }}
          accessibilityLayer
        >
          <XAxis dataKey="index" type="number" domain={["dataMin", "dataMax"]} hide />
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <Line
            dataKey="value"
            type="linear"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip
            isAnimationActive={false}
            labelFormatter={() => ""}
            formatter={(value) => [
              typeof value === "number" ? (valueFormatter?.(value) ?? String(value)) : "No data",
              "",
            ]}
            contentStyle={{
              background: "var(--bg-elev)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </span>
  );
}
