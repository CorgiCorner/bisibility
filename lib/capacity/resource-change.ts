export type ResourceDimension =
  | "projects"
  | "scheduledKeywords"
  | "trackedPrompts"
  | "teamMembers"
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
  /** Read-only forecast. No locks, writes or enforcement side effects. */
  preview?: { deltas: Partial<Record<ResourceDimension, number>> };
  cadence?: {
    dimension: "scheduleFrequencies" | "promptSchedules";
    before?: CapacityCadence;
    after: CapacityCadence;
  };
};

export type CapacityProjection = { exceeded: boolean; limit: number | null; projected: number };
export type ResourceCapacityProjection = Partial<
  Record<ResourceDimension | "scheduleFrequencies" | "promptSchedules", CapacityProjection>
>;

/** Capture under the transaction lock, mutate, then check before committing. */
export type ResourceCapacityCheck = {
  enabled: boolean;
  check: () => Promise<void>;
  projection?: ResourceCapacityProjection;
};

export const unrestrictedResourceChange: ResourceCapacityCheck = {
  enabled: false,
  check: async () => {},
};
