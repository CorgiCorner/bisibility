import type { ProjectDefaults } from "@/lib/generated/prisma/client";
import type { SettingsSource } from "./source";
export function defaultsRowForTest(values: Partial<ProjectDefaults> = {}): ProjectDefaults {
  return {
    enabledExperimentalModules: [],
    id: "synthetic-defaults",
    projectId: "project",
    city: null,
    country: null,
    device: null,
    locationKey: null,
    frequency: "manual",
    cronExpression: null,
    timezone: "UTC",
    jitterMinutes: 0,
    nextCheckAt: null,
    lastCheckedAt: null,
    serpDepth: 100,
    serpStopOnMatch: true,
    inspectionDailyLimit: 50,
    searchSyncImportMonths: null,
    searchSyncPace: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...values,
  };
}
/** Empty target cohort for pure legacy input/serialization tests, not captured observation authority. */
export function defaultsSourceForTest(defaults: ProjectDefaults | null): SettingsSource {
  return {
    project: {
      id: "project",
      publicId: `prj_${"a".repeat(24)}`,
      writeMode: "active",
      isSample: false,
    },
    policy: { state: "unconfigured", policyEpoch: "0", config: null },
    defaults,
    schedule: null,
    schedules: [],
    connectionRows: [],
    markets: [],
    chain: [],
    targets: [],
    role: "member",
    rateVersion: null,
    sourceHash: "a".repeat(64),
  };
}
