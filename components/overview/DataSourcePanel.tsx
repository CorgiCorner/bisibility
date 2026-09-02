import { Card, SectionTitle } from "@/components/ui";
import type { DataSourceHealth } from "./types";

export type DataSourcePanelProps = {
  checkHealth?: {
    budget: { exhausted: boolean };
    failed24h: { count: number };
  };
  health: DataSourceHealth;
};

export function DataSourcePanel({ checkHealth, health }: Readonly<DataSourcePanelProps>) {
  const metrics = checkHealth
    ? [...health.metrics, { label: "Failed (24h)", value: String(checkHealth.failed24h.count) }]
    : health.metrics;

  return (
    <Card className="px-5 py-4.5" size="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionTitle>Data source</SectionTitle>
          <span>{health.description}</span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {checkHealth?.budget.exhausted ? (
            <span
              className="inline-flex flex-none items-center gap-[7px] rounded-full px-[11px] py-1.5 font-sans tabular-nums text-[11.5px] font-semibold"
              style={{
                backgroundColor: "color-mix(in srgb, var(--yellow) 12%, transparent)",
                color: "var(--yellow-text)",
              }}
            >
              <span
                aria-hidden
                className="h-[7px] w-[7px] rounded-full"
                style={{ backgroundColor: "var(--yellow)" }}
              />
              {"Budget reached "}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-4.5 gap-y-3.5">
        {metrics.map((metric) => (
          <div className="min-w-0" key={metric.label}>
            <div className="font-sans tabular-nums text-[10px] uppercase tracking-[0.6px] text-fg-muted">
              {metric.label}
            </div>
            <div className="mt-[5px] flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-fg">{metric.value}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
