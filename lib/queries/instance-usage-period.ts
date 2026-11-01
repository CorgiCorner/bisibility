export type InstanceUsagePeriod = "all" | "month";

export function instanceUsagePeriod(value: unknown): InstanceUsagePeriod {
  return value === "month" ? "month" : "all";
}
