import type { InstanceUsageReport } from "@/lib/queries/instance-usage-report";

/** Synthetic records, including a retained project and financially unknown closures. */
export const instanceUsageFixture: InstanceUsageReport = {
  period: "all",
  from: null,
  to: "2026-10-28T20:00:00.001Z",
  totals: {
    operations: 31,
    recordedOperations: 19,
    unknownOperations: 12,
    costUsdUnits: "6256660",
  },
  providers: [
    {
      provider: "dataforseo",
      operations: 13,
      recordedOperations: 1,
      unknownOperations: 12,
      costUsdUnits: "6000000",
    },
    {
      provider: "historical-unknown",
      operations: 18,
      recordedOperations: 18,
      unknownOperations: 0,
      costUsdUnits: "256660",
    },
  ],
  topProjects: [
    {
      provider: "dataforseo",
      projectId: "project_example",
      operations: 13,
      recordedOperations: 1,
      unknownOperations: 12,
      costUsdUnits: "6000000",
      sharePercent: 95.89,
    },
    {
      provider: "historical-unknown",
      projectId: null,
      operations: 18,
      recordedOperations: 18,
      unknownOperations: 0,
      costUsdUnits: "256660",
      sharePercent: 4.1,
    },
  ],
};
