/** Evenly thinned category ticks, always keeping the first and last point. */
export function timeSeriesCategoryTicks(count: number): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  const step = Math.max(1, Math.round((count - 1) / 4));
  const indexes = [0];
  for (let index = step; index < count - 1; index += step) indexes.push(index);
  indexes.push(count - 1);
  return indexes;
}

export function timeSeriesAxisCompact(min: number, max: number) {
  return Math.max(Math.abs(min), Math.abs(max)) >= 1000;
}

export function timeSeriesAxisNumber(value: number, locale: string, compact: boolean) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

/** Endpoints plus three interior ticks, so the axis width covers the widest label. */
export function timeSeriesSampleTicks(min: number, max: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const step = (max - min) / 4;
  return [0, 1, 2, 3, 4].map((index) => min + step * index);
}

const AXIS_CHAR_PX = 8;
const AXIS_PAD_PX = 18;

export function timeSeriesYAxisWidth(labels: readonly string[], minimum: number) {
  const widest = labels.reduce((width, label) => Math.max(width, label.length), 0);
  return Math.max(minimum, widest * AXIS_CHAR_PX + AXIS_PAD_PX);
}

export function resolveTimeSeriesAxis(input: {
  formatValue?: (value: number) => string;
  labelCount: number;
  locale: string;
  max?: number;
  min: number;
  series: readonly { values: readonly (number | null)[] }[];
  xTickIndexes?: readonly number[];
  yTicks?: readonly number[];
  yWidth: number;
}) {
  const values = input.series.flatMap((item) =>
    item.values.filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    ),
  );
  const dataMax = values.length > 0 ? Math.max(...values) : input.min;
  const axisMax = input.max ?? Math.max(input.min, dataMax);
  const samples = input.yTicks ?? timeSeriesSampleTicks(input.min, axisMax);
  const peak = samples.reduce(
    (highest, value) => Math.max(highest, Math.abs(value)),
    Math.abs(axisMax),
  );
  const compact = input.formatValue == null && timeSeriesAxisCompact(input.min, peak);
  const formatTick = (value: number) =>
    input.formatValue?.(value) ?? timeSeriesAxisNumber(value, input.locale, compact);
  return {
    categoryTicks: input.xTickIndexes ?? timeSeriesCategoryTicks(input.labelCount),
    formatTick,
    yAxisWidth: timeSeriesYAxisWidth(
      samples.map((value) => formatTick(value)),
      input.yWidth,
    ),
  };
}
