import { Card, MonoText, SectionTitle } from "@/components/ui";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/ssr";
import { DataSourceStatusBadge } from "./DataSourceStatusBadge";
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
          <MonoText muted>{health.description}</MonoText>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <DataSourceStatusBadge status={health.status} />
          {checkHealth?.budget.exhausted ? (
            <span
              className="inline-flex flex-none items-center gap-[7px] rounded-full px-[11px] py-1.5 font-mono text-[11.5px] font-semibold"
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
            <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
              {metric.label}
            </div>
            <div className="mt-[5px] truncate text-sm font-semibold text-fg">{metric.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-[9px] border-t border-border-soft pt-3.5 text-[12.5px] leading-5 text-fg-muted">
        <span className="flex h-5 shrink-0 items-center">
          <Info aria-hidden className="text-accent-text" size={15} />
        </span>
        <span>{health.note}</span>
      </div>
    </Card>
  );
}
