import type { Prisma } from "@/lib/generated/prisma/client";
import type { MeasurementScope } from "@/lib/rank-measurements/types";
import type { RankReportContext, RankReportDatabase } from "@/lib/rank-reports/access";
import type { RankReportTargetMetadata } from "@/lib/rank-reports/database";
import type {
  RankReportLimits,
  RankReportPolicy,
  ResolvedReportTarget,
} from "@/lib/rank-reports/model";
import type { RankReportObservation } from "@/lib/rank-reports/records";
import type { rankReportTargetResolution } from "@/lib/rank-reports/resolution";
import type { Metrics } from "./keyword-metrics";
import type { KeywordRow, KeywordTrafficSummary } from "./keyword-row-types";

export type RankTrackerReportMetadata = RankReportTargetMetadata & {
  /** Independent current immutable target/policy revision proof; null is explicitly unavailable. */
  expectedScope: MeasurementScope | null;
  metrics?: Metrics;
  traffic?: KeywordTrafficSummary;
};
export type RankTrackerReportOptions = {
  asOf: Date;
  context?: RankReportContext;
  db?: RankReportDatabase;
  limits: RankReportLimits;
  /** Active markets/unarchived targets by default; pause execution retains history. */
  pausedSchedules?: "include_retained" | "exclude";
  policyAt: (asOf: Date) => RankReportPolicy;
  loadMetadata: (
    tx: Prisma.TransactionClient,
    project: { id: string; publicId: string },
    targets: readonly { id: string; publicId: string }[],
    asOf: Date,
  ) => Promise<ReadonlyMap<string, RankTrackerReportMetadata>>;
};
export type RankTrackerQualityRow = KeywordRow & {
  rankQuality: ReturnType<typeof rankReportTargetResolution> & {
    currentScopeReason: "current_scope_unavailable" | null;
    currentScopeState: "verified" | "unavailable";
    lastKnown: ReturnType<typeof rankReportTargetResolution>;
    lastKnownScopes: Pick<RankReportObservation, "configuredScope" | "effectiveScope"> | null;
  };
};
export type RankTrackerCurrentTarget = ResolvedReportTarget & {
  currentScopeState: "verified" | "unavailable";
  historicalResolution: ResolvedReportTarget;
};
export type RankTrackerResolvedRow = {
  resolution: ResolvedReportTarget;
  row: RankTrackerQualityRow;
};

export class RankTrackerReportConfigurationError extends Error {
  constructor() {
    super("Rank tracker report policy and read budgets must be configured by the server.");
  }
}
