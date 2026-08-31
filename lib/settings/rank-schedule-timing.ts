import type { RankCheckFrequency } from "./options";

type RankScheduleTiming = {
  detail: string | null;
  label: "Cadence" | "Next run";
  value: string;
};

export function rankScheduleTiming(
  frequency: RankCheckFrequency,
  timezone: string,
  nextRunLabels: readonly string[],
): RankScheduleTiming {
  if (frequency === "daily" || frequency === "weekly") {
    const interval = frequency === "daily" ? "24 hours" : "7 days";
    return {
      detail: "Stable phase distributed across the interval",
      label: "Cadence",
      value: `Every ${interval} per keyword`,
    };
  }
  if (frequency === "monthly") {
    return {
      detail: `Wall-clock anchor in ${timezone}`,
      label: "Cadence",
      value: "Monthly per keyword",
    };
  }
  return {
    detail: null,
    label: "Next run",
    value:
      frequency === "manual" || frequency === "paused"
        ? "Not scheduled"
        : (nextRunLabels[0] ?? "No runs available"),
  };
}
