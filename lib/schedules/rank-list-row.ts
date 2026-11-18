import type { NativeUsageEstimate } from "@/lib/cost-estimate/native-usage";

type ScheduleFrequency = "custom_cron" | "daily" | "manual" | "monthly" | "paused" | "weekly";
export type ScheduleListRow = {
  archivedAt?: string | null;
  assignedKeywordCount?: number;
  blocked?: boolean;
  cronExpression?: string | null;
  dayOfMonth?: number | null;
  enabled: boolean;
  frequency: ScheduleFrequency;
  jitterMinutes?: number;
  keywordCount: number;
  memberDeviceCount?: number;
  memberMarketCount?: number;
  name: string;
  nextRunAt?: string | null;
  perRunCents?: number | null;
  nativeEstimate?: NativeUsageEstimate;
  publicId: string;
  sharedTag?: string | null;
  targetCount?: number | null;
  timeOfDay?: string | null;
  timezone?: string | null;
  weekday?: string | null;
};
