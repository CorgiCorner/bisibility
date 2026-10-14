import type { MeasurementReport } from "@/lib/rank-measurements/types";
import type { Keyword } from "./overview-trend";

export type OverviewContributor = {
  id: string;
  keyword: string;
  device: string;
  market: string;
  value: number | null;
  delta: number | null;
  weight: number | null;
  status: "resolved" | "excluded";
  reason: string | null;
};

/** Includes every selected target, with null for exclusions and absent comparison evidence. */
export function overviewContributors(
  keywords: readonly Keyword[],
  report: MeasurementReport,
): OverviewContributor[] {
  const values = new Map(report.contributions.map((row) => [row.targetId, row]));
  const exclusions = new Map(report.exclusions.map((row) => [row.targetId, row.reason]));
  return keywords
    .map((keyword) => {
      const value = values.get(keyword.publicId);
      return {
        id: keyword.publicId,
        keyword: keyword.text,
        device: keyword.device,
        market: keyword.locationRef.displayName,
        value: value?.value ?? null,
        delta: value?.delta ?? null,
        weight: value?.weight ?? null,
        status: value ? ("resolved" as const) : ("excluded" as const),
        reason: exclusions.get(keyword.publicId) ?? null,
      };
    })
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.id.localeCompare(b.id));
}
