import type { InstanceAdminOperations } from "@/lib/queries/instance-admin-operational";
import type { InstanceRecoveryAccounting } from "@/lib/queries/instance-recovery-accounting";
import type { InstanceUsagePeriod, InstanceUsageReport } from "@/lib/queries/instance-usage-report";
import type { aggregateProviderReferenceUsage } from "@/lib/rank-check/reference-usage";

/** Presentation contract shared by current admin views and their fixtures. */
export type InstanceAdminDashboard = Omit<InstanceAdminOperations, "availability"> & {
  availability: InstanceAdminOperations["availability"] & { stats: boolean };
  stats: {
    activeProviderConnectionsByKind: { count: number; kind: string }[];
    keywords: number;
    recoveryAccounting: InstanceRecoveryAccounting | null;
    usagePeriod: InstanceUsagePeriod;
    usageReport: InstanceUsageReport | null;
    projects: number;
    providerUsage: ReturnType<typeof aggregateProviderReferenceUsage>;
    users: number;
  };
};
