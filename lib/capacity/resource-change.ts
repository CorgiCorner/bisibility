export type ResourceDimension =
  | "projects"
  | "scheduledKeywords"
  | "trackedPrompts"
  | "competitorsPerProject"
  | "alertRulesAndWebhooks";

export type CapacityCadence = {
  frequency: string;
  enabled: boolean;
  cronExpression?: string | null;
  timezone?: string | null;
};

export type ResourceChange = {
  ownerId?: string;
  projectId?: string;
  dimensions: readonly ResourceDimension[];
  activating?: boolean;
  cadence?: {
    dimension: "scheduleFrequencies" | "promptSchedules";
    before?: CapacityCadence;
    after: CapacityCadence;
  };
};

/** Capture under the transaction lock, mutate, then check before committing. */
export type ResourceCapacityCheck = { enabled: boolean; check: () => Promise<void> };

export const unrestrictedResourceChange: ResourceCapacityCheck = {
  enabled: false,
  check: async () => {},
};
