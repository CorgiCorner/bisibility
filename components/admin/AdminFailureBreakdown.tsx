import { IdChip } from "@/components/ui";
import type { FailureBreakdown } from "@/lib/ops/instance-admin-health";

const countFormat = new Intl.NumberFormat("en-US");

function relativeTime(value: string, now: string): string {
  const timestamp = Date.parse(value);
  const reference = Date.parse(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(reference)) return "-";

  const elapsedSeconds = Math.max(0, Math.floor((reference - timestamp) / 1_000));
  if (elapsedSeconds < 60) return "just now";

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

export function AdminFailureBreakdown({
  breakdown,
  emptyLabel = "No failed rank checks in the last 24 hours.",
  now,
}: Readonly<{ breakdown: FailureBreakdown; emptyLabel?: string; now: string }>) {
  if (breakdown.groups.length === 0) {
    return <p className="text-xs text-fg-muted">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col">
      {breakdown.groups.map((group) => {
        const concentrated = group.projectIds.length > 0;
        return (
          <div
            className="flex flex-wrap items-center gap-3 border-b border-border-soft px-0.5 py-3 last:border-0"
            data-admin-failure-group
            key={`${group.provider}:${group.errorSummary}`}
          >
            <span className="min-w-[5.5rem] shrink-0 font-mono text-base font-bold tracking-tight text-fg">
              {countFormat.format(group.count)}
            </span>
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="font-mono text-xs font-semibold text-fg">{group.errorSummary}</span>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <span className="font-mono text-xs text-fg-muted">{group.provider}</span>
            </span>
            <span className="text-xs text-fg-muted">
              {concentrated
                ? `${group.projectCount} ${group.projectCount === 1 ? "project" : "projects"}`
                : `across ${countFormat.format(group.projectCount)} projects`}
            </span>
            {concentrated ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {group.projectIds.map((projectId) => (
                  <IdChip copyLabel="Copy project ID" key={projectId} size="sm" value={projectId} />
                ))}
              </span>
            ) : null}
            <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-fg-faint">
              first seen {relativeTime(group.firstSeen, now)}
              <span
                aria-hidden="true"
                className="mx-2 inline-block h-2.5 w-px bg-border align-middle"
              />
              last seen {relativeTime(group.lastSeen, now)}
            </span>
          </div>
        );
      })}
      {breakdown.remainderCount > 0 ? (
        <p className="px-0.5 py-2 text-xs text-fg-faint">
          and {countFormat.format(breakdown.remainderCount)} more classes
        </p>
      ) : null}
    </div>
  );
}
