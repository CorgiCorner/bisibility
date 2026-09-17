import type { TrackingScheduleSelection } from "@/components/keywords/add/TrackingConfigurationFields";
import { monthlyCostCentsFor } from "@/lib/cost-estimate/project-estimate";
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

export type ResearchTrackingCostFact =
  | { frequency: "manual" | "paused"; kind: "zero"; projectDefault: boolean }
  | { frequency: "custom_cron"; kind: "custom_cron"; projectDefault: boolean }
  | {
      frequency: Exclude<TrackingScheduleSelection, "project_default">;
      kind: "unavailable";
      locationCount: number;
      projectDefault: boolean;
    }
  | {
      costCents: number;
      frequency: Exclude<TrackingScheduleSelection, "project_default">;
      kind: "estimated";
      projectDefault: boolean;
    };

export function researchTrackingCostLine(
  context: ProjectCostContext,
  schedule: TrackingScheduleSelection,
  cost: number | null,
  locationCount = 1,
): ResearchTrackingCostFact {
  const frequency = schedule === "project_default" ? context.rawFrequency : schedule;
  const projectDefault = schedule === "project_default";
  if (frequency === "manual" || frequency === "paused") {
    return { frequency, kind: "zero", projectDefault };
  }
  if (cost == null) {
    if (frequency === "custom_cron") return { frequency, kind: "custom_cron", projectDefault };
    return { frequency, kind: "unavailable", locationCount, projectDefault };
  }
  return { costCents: cost, frequency, kind: "estimated", projectDefault };
}
