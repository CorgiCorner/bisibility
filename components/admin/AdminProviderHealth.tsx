import {
  type HealthTone,
  healthToneForRate,
  type ProviderHealthRow,
} from "@/lib/ops/instance-admin-health";

const countFormat = new Intl.NumberFormat("en-US");

const pillToneClasses: Record<HealthTone, string> = {
  failed: "bg-red/10 text-red-text",
  ok: "bg-green/10 text-green-text",
  stale: "bg-yellow/10 text-yellow-text",
  unknown: "bg-bg-sunken text-fg-muted",
};

const barToneClasses: Record<HealthTone, string> = {
  failed: "bg-red",
  ok: "bg-green",
  stale: "bg-yellow",
  unknown: "bg-fg-muted",
};

function countPill(label: string, count: number, tone: HealthTone) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${pillToneClasses[tone]}`}
    >
      {label} {countFormat.format(count)}
    </span>
  );
}

function ageLabel(ageMs: number | null): string {
  if (ageMs === null) return "-";
  const hours = ageMs / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ageMs / 60_000))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}

function rateLabel(rate: number | null): string {
  if (rate === null) return "unknown";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(rate)}% failed`;
}

export function AdminProviderHealth({ rows }: Readonly<{ rows: readonly ProviderHealthRow[] }>) {
  if (rows.length === 0) {
    return <p className="text-xs text-fg-muted">No connected analytics sources.</p>;
  }

  return (
    <div className="flex flex-col">
      {rows.map((row) => {
        const tone = healthToneForRate(row.failureRatePercent);
        const barWidth = Math.min(100, Math.max(0, row.failureRatePercent ?? 0));
        return (
          <div
            className="flex flex-wrap items-center gap-3 border-b border-border-soft px-0.5 py-3 last:border-0"
            key={row.provider}
          >
            <span className="min-w-[4.75rem] shrink-0 font-mono text-xs font-bold text-fg">
              {row.provider}
            </span>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {countPill("ok", row.ok, "ok")}
              {countPill("stale", row.stale, "stale")}
              {countPill("failed", row.failed, "failed")}
              {countPill("not run", row.notRun, "unknown")}
            </span>
            <span className="font-mono text-[11px] text-fg-muted">
              p95 last success: {ageLabel(row.p95AgeMs)}
            </span>
            <span className="ml-auto inline-flex min-w-[9.5rem] items-center gap-2">
              <span className="h-1.5 min-w-[4.5rem] flex-1 overflow-hidden rounded-full bg-bg-sunken">
                <span
                  className={`block h-full rounded-full ${barToneClasses[tone]}`}
                  data-tone={tone}
                  style={{ width: `${barWidth}%` }}
                />
              </span>
              <span
                className={`whitespace-nowrap font-mono text-[11px] font-bold ${pillToneClasses[tone]}`}
              >
                {rateLabel(row.failureRatePercent)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
