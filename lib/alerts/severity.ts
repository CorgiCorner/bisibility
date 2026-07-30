export const alertSeverities = ["info", "warning", "urgent"] as const;

export type AlertSeverity = (typeof alertSeverities)[number];

export function defaultAlertSeverity(conditionType: string): AlertSeverity {
  if (conditionType === "enters_top_n" || conditionType === "serp_feature") {
    return "info";
  }
  if (
    conditionType === "threshold" ||
    conditionType === "exits_top_n" ||
    conditionType === "url_mismatch"
  ) {
    return "urgent";
  }
  return "warning";
}
