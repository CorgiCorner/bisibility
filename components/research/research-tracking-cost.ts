import type { TrackingScheduleSelection } from "@/components/keywords/add/TrackingConfigurationFields";
import { formatEstimateCents, monthlyCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";

export function researchTrackingCost(
  context: ProjectCostContext,
  schedule: TrackingScheduleSelection,
  locationCount = 1,
) {
  const frequency = schedule === "project_default" ? context.rawFrequency : schedule;
  return monthlyCostCentsFor(
    {
      cronExpression: schedule === "project_default" ? context.cronExpression : null,
      depth: context.depth,
      deviceCount: 1,
      frequency,
      keywordCount: 1,
      locationCount,
    },
    { overrideCents: context.costPerCheckCents, providerId: context.providerId },
  );
}

export function researchTrackingCostLine(
  context: ProjectCostContext,
  schedule: TrackingScheduleSelection,
  cost: number | null,
  locationCount = 1,
): { emphasis: string | null; lead: string; tail: string } {
  const frequency = schedule === "project_default" ? context.rawFrequency : schedule;
  if (frequency === "manual" || frequency === "paused") {
    return { emphasis: "$0/mo", lead: "Tracking cost: scheduled spend ", tail: "." };
  }
  if (cost == null) {
    return {
      emphasis: null,
      lead:
        frequency === "custom_cron"
          ? "Tracking cost excludes the custom cron schedule."
          : `Tracking estimate: 1 keyword, ${locationCount} ${locationCount === 1 ? "location" : "locations"}, ${frequency.replace("_", " ")}.`,
      tail: "",
    };
  }
  const frequencyLabel =
    schedule === "project_default" ? `project default, ${frequency}` : frequency;
  return {
    emphasis: `~${formatEstimateCents(cost)}`,
    lead: "Tracking cost: ",
    tail: `/month at ${frequencyLabel.replace("_", " ")} checks, billed to your own account.`,
  };
}
