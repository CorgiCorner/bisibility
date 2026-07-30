import type { DatabaseHeartbeat, TrafficHeartbeatRow } from "@/lib/ops/heartbeat-data";

const HOUR_MS = 60 * 60 * 1000;

export function relativeTime(value: string | Date, now: Date) {
  const milliseconds = new Date(value).getTime() - now.getTime();
  const absolute = Math.abs(milliseconds);
  if (absolute < 60_000) return "just now";
  const amount =
    absolute < HOUR_MS
      ? `${Math.round(absolute / 60_000)} min`
      : absolute < 24 * HOUR_MS
        ? `${(absolute / HOUR_MS).toFixed(1)} h`
        : `${(absolute / (24 * HOUR_MS)).toFixed(1)} d`;
  return milliseconds > 0 ? `in ${amount}` : `${amount} ago`;
}

export function trafficCounts(rows: TrafficHeartbeatRow[]) {
  return rows.reduce(
    (counts, row) => {
      if (row.status.startsWith("succeeded_")) counts.ok += 1;
      else if (row.status === "not_run") counts.notRun += 1;
      else if (row.status === "stale") counts.stale += 1;
      else counts.failed += 1;
      return counts;
    },
    { failed: 0, notRun: 0, ok: 0, stale: 0 },
  );
}

export function isLikelyMisconfigured(row: TrafficHeartbeatRow) {
  return row.latestSuccessAt === null && row.errorClass === "config_invalid";
}

function providerTrafficLine(provider: string, rows: TrafficHeartbeatRow[]) {
  const counts = trafficCounts(rows);
  return `${provider.toUpperCase()} ok ${counts.ok} · stale ${counts.stale} · failed ${counts.failed} · not run ${counts.notRun}`;
}

export function trafficLines(database: DatabaseHeartbeat, now: Date) {
  if (database.traffic.length === 0) return "No analytics connections configured.";
  const grouped = new Map<string, TrafficHeartbeatRow[]>();
  for (const row of database.traffic) {
    grouped.set(row.provider, [...(grouped.get(row.provider) ?? []), row]);
  }
  const summary = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([provider, rows]) => providerTrafficLine(provider, rows))
    .join("; ");
  const unhealthy = database.traffic.filter((row) => !row.status.startsWith("succeeded_"));
  if (unhealthy.length === 0) return summary;
  const details = unhealthy.slice(0, 5).map((row) => {
    const fresh = row.latestSuccessAt ? relativeTime(row.latestSuccessAt, now) : "never";
    const errorClass = row.errorClass ? `; class ${row.errorClass}` : "";
    const misconfigured = isLikelyMisconfigured(row)
      ? "; likely misconfigured - check Integrations"
      : "";
    return `${row.provider.toUpperCase()} / ${row.project}: ${row.status}${errorClass}; last success ${fresh}${misconfigured}`;
  });
  if (unhealthy.length > 5) details.push(`and ${unhealthy.length - 5} more`);
  return `${summary}\n${details.join("\n")}`;
}
