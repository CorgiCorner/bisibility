import type { IndexingDay } from "@/lib/search-index/ui-model";

type Shape = { x?: number; y?: number; width?: number; height?: number };

export function TrendColumn({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fill,
  payload,
  top,
}: Shape & { fill?: string; payload?: IndexingDay; top: boolean }) {
  if (!height) return <g />;
  const rounded = top || !payload?.notIndexed;
  const radius = rounded ? Math.min(4, width / 2, height) : 0;
  return (
    <g>
      <path
        d={`M${x},${y + height}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + width - radius}Q${x + width},${y} ${x + width},${y + radius}V${y + height}Z`}
        fill={fill}
      />
      {rounded && payload?.changes.count ? (
        <path
          data-changes={payload.changes.count}
          d={`M${x + width / 2},${y - 10}l4,4l-4,4l-4,-4Z`}
          fill="var(--fg-muted)"
        />
      ) : null}
      {top && payload?.indexed ? (
        <path d={`M${x},${y + height}H${x + width}`} stroke="var(--bg-elev)" strokeWidth={2} />
      ) : null}
    </g>
  );
}

export function TrendStopMark({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  payload,
}: Shape & { payload?: IndexingDay }) {
  if (!payload?.stop) return <g />;
  const baseline = y + height;
  return payload.stop === "off" ? (
    <path
      data-stop="off"
      d={`M${x},${baseline}h${width}`}
      stroke="var(--fg-muted)"
      strokeDasharray="2 2"
    />
  ) : (
    <path
      data-stop="quota"
      d={`M${x + width / 2 - 4},${baseline + 5}h8v2h-8Z`}
      fill="var(--fg-muted)"
    />
  );
}
