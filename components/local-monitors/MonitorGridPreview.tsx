"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import { gridCoordinates } from "@/lib/local-monitoring/geodesic";
import type { MonitorFormValues } from "@/lib/local-monitors/form-model";
import { useTranslations } from "next-intl";
import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";

export function MonitorGridPreview({ form }: Readonly<{ form: UseFormReturn<MonitorFormValues> }>) {
  const t = useTranslations("shared.localMonitors");
  const id = useId();
  const grid = form.watch("grid");
  let points: ReturnType<typeof gridCoordinates>;
  try {
    points = gridCoordinates({
      center: { latitude: grid.latitude, longitude: grid.longitude },
      size: grid.size,
      spacingMetres: grid.spacingMetres,
    });
  } catch {
    return (
      <p className="m-0 text-ui-xs text-fg-muted">
        {t(!grid.latitude || !grid.longitude ? "center.previewEmpty" : "center.previewInvalid")}
      </p>
    );
  }
  const position = (index: number) =>
    grid.size === 1 ? 100 : 24 + (index * 152) / (grid.size - 1);
  return (
    <figure
      className="m-0 rounded-control border border-border p-3"
      aria-labelledby={`${id}-caption`}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <svg viewBox="0 0 200 200" className="h-32 w-32 shrink-0 text-fg-muted" aria-hidden="true">
          {grid.size > 1
            ? points
                .filter((point) => point.column === 0)
                .map((point) => (
                  <path
                    key={point.row}
                    d={`M24 ${position(point.row)}H176 M${position(point.row)} 24V176`}
                    stroke="currentColor"
                    strokeOpacity="0.3"
                    fill="none"
                  />
                ))
            : null}
          {points.map((point) => (
            <circle
              key={point.ordinal}
              cx={position(point.column)}
              cy={position(point.row)}
              r={
                point.row === Math.floor(grid.size / 2) &&
                point.column === Math.floor(grid.size / 2)
                  ? 7
                  : 4
              }
              className="fill-accent"
            />
          ))}
        </svg>
        <figcaption id={`${id}-caption`} className="flex min-w-0 flex-col gap-1 text-ui-xs">
          <p className="m-0 text-ui-body font-medium">
            {t("center.preview", { count: points.length })}
          </p>
          <p className="m-0 tabular-nums text-fg-muted">
            {grid.latitude}, {grid.longitude}
          </p>
          <p className="m-0 text-fg-muted">
            {t("center.previewSpacing", { metres: String(grid.spacingMetres) })}
          </p>
          <p className="m-0 text-fg-muted">{t("center.previewHelp")}</p>
        </figcaption>
      </div>
      <details className="mt-2">
        <summary className="w-fit cursor-pointer text-ui-xs text-fg-muted underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid">
          {t("center.showPoints")}
        </summary>
        <div className="mt-2 max-h-48 overflow-auto">
          <DataTable
            id={`${id}-points`}
            ariaLabel={t("center.showPoints")}
            columns={[
              { id: "point", header: t("point"), cell: ({ row }) => row.original.ordinal + 1 },
              {
                id: "latitude",
                header: t("fields.latitude"),
                cell: ({ row }) => row.original.coordinate.latitude,
              },
              {
                id: "longitude",
                header: t("fields.longitude"),
                cell: ({ row }) => row.original.coordinate.longitude,
              },
            ]}
            rows={points.map((point) => ({ ...point, id: String(point.ordinal) }))}
            sorting={null}
            onSortingChange={() => undefined}
          />
        </div>
      </details>
    </figure>
  );
}
