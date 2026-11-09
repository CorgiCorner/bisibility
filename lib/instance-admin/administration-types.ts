import type { InstanceRecoveryAccounting } from "@/lib/queries/instance-recovery-accounting";
import type { InstanceUsagePeriod, InstanceUsageReport } from "@/lib/queries/instance-usage-report";
import type { ReferenceUsageRateBasis } from "@/lib/rank-check/reference-usage";

export type GrowthPoint = { count: number; date: string };
export type GrowthMetric = {
  delta: number;
  deltaPercent: number | null;
  points: readonly GrowthPoint[];
  priorTotal: number;
  total: number;
};
export type TopProjectConsumption = {
  billableUnits: number;
  checks: number;
  projectId: string;
  provider: string;
  providerLabel: string;
  rateBasis: ReferenceUsageRateBasis;
  referenceCostCents: number;
  referenceCostKnown: boolean;
  sharePercent: number;
};
export type InstanceAdminAdministration = {
  activeAccountsApprox: number;
  generatedAt: string;
  mailerConfigured: boolean;
  growth: {
    keywords: GrowthMetric;
    projects: GrowthMetric;
    rankChecks: GrowthMetric;
    users: GrowthMetric;
  };
  monthStart: string;
  recoveryAccounting: InstanceRecoveryAccounting | null;
  usagePeriod: InstanceUsagePeriod;
  usageReport: InstanceUsageReport | null;
  topConsumption: readonly TopProjectConsumption[];
};
