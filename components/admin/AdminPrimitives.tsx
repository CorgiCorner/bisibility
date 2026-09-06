import { Card, SectionTitle } from "@/components/ui";
import { type DateFormat, formatDateTime } from "@/lib/dates/format";
import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

const unavailable = "-";

export function displayTime(value: string | null, dateFormat: DateFormat = "day_first") {
  if (!value) return unavailable;
  const date = new Date(value);
  return `${formatDateTime(date, dateFormat)}:${String(date.getUTCSeconds()).padStart(2, "0")}`;
}

export function duration(value: number | null) {
  if (value === null) return unavailable;
  if (value < 1_000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} s`;
  return `${(value / 60_000).toFixed(1)} min`;
}

function statusTone(status: string) {
  if (["ok", "completed", "succeeded_empty", "succeeded_with_data", "delivered"].includes(status)) {
    return "bg-green/10 text-green-text";
  }
  if (["stale", "deferred", "deferred_rate_limit", "warning"].includes(status)) {
    return "bg-yellow/10 text-yellow-text";
  }
  if (["failed", "error", "undelivered"].includes(status)) return "bg-red/10 text-red-text";
  return "bg-bg-sunken text-fg-muted";
}

export function Badge({ children, status }: Readonly<{ children?: ReactNode; status: string }>) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
        statusTone(status),
      )}
    >
      {children ?? status.replaceAll("_", " ")}
    </span>
  );
}

export function Metric({ label, value }: Readonly<{ label: string; value: ReactNode }>) {
  return (
    <div className="min-w-0 rounded-card border border-border bg-bg-sunken px-3 py-2.5">
      <div className="text-[11px] font-medium text-fg-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-fg">{value}</div>
    </div>
  );
}

export function Panel({
  children,
  description,
  title,
}: Readonly<{ children: ReactNode; description: string; title: string }>) {
  const id = `admin-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section aria-labelledby={id}>
      <Card size="lg">
        <SectionTitle id={id}>{title}</SectionTitle>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">{description}</p>
        <div className="mt-4">{children}</div>
      </Card>
    </section>
  );
}

export function RankWindow({
  data,
  label,
}: Readonly<{ data: InstanceAdminDashboard["rank7d"]; label: string }>) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-fg">{label}</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <Metric label="Scheduled" value={data.scheduled} />
        <Metric label="Succeeded" value={data.succeeded} />
        <Metric label="Failed" value={data.failed} />
        <Metric label="Deferred" value={data.deferred} />
        <Metric label="Stuck" value={data.stuck} />
        <Metric label="Lag p50" value={duration(data.lagP50Ms)} />
        <Metric label="Lag p95" value={duration(data.lagP95Ms)} />
      </div>
    </div>
  );
}
