"use client";
import { Button } from "@/components/ui/Button";
import type { LocalResultGrid, LocalResultPoint } from "@/lib/local-monitor-results/model";
import { useTranslations } from "next-intl";
export function MonitorResultGrid({
  grid,
  points,
  onPoint,
}: {
  grid: LocalResultGrid;
  points: readonly LocalResultPoint[];
  onPoint: (id: string) => void;
}) {
  const t = useTranslations("shared.localMonitors"),
    byId = new Map(points.map((point) => [point.id, point]));
  return (
    <fieldset
      aria-label={t("results.grid")}
      className="m-0 grid min-w-0 max-w-xl gap-2 border-0 p-0"
      style={{ gridTemplateColumns: `repeat(${grid.size},minmax(0,1fr))` }}
    >
      {grid.pointIds.map((id) => {
        const point = byId.get(id);
        if (!point) return null;
        return (
          <Button
            key={id}
            style={{ gridRow: point.row + 1, gridColumn: point.column + 1 }}
            variant="outline"
            className="h-auto min-h-16 flex-col gap-1"
            onClick={() => onPoint(id)}
            aria-label={`${t("point")} ${point.ordinal + 1}: ${point.latitude}, ${point.longitude}; ${t("results.rank")}: ${point.position ?? t("results.unknown")}`}
          >
            <span className="text-xs text-fg-muted">{point.ordinal + 1}</span>
            <span>{point.position ?? t("results.unknown")}</span>
          </Button>
        );
      })}
    </fieldset>
  );
}
