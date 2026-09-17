import type { DataSourceHealth } from "./types";

type DataSourceStatus = DataSourceHealth["status"];

export function dataSourceStatusColor(status: DataSourceStatus) {
  if (status === "notConnected") {
    return "var(--fg-muted)";
  }

  if (status === "migrationHold" || status === "needsAttention") {
    return "var(--yellow)";
  }

  return "var(--green)";
}

export function dataSourceStatusTextColor(status: DataSourceStatus) {
  if (status === "notConnected") return "var(--fg-muted)";
  if (status === "migrationHold" || status === "needsAttention") return "var(--yellow-text)";
  return "var(--green-text)";
}
