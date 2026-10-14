import type { OverviewFilters } from "@/lib/queries/overview-filters";
import type {
  MeasurementReport,
  MeasurementScope,
  ResolvedMeasurement,
} from "@/lib/rank-measurements/types";
import type { RankReportTarget } from "@/lib/rank-reports/model";
import type { DashboardLocalSelection } from "./selection";

export type LocalReadFilters = OverviewFilters & { canonicalLocationKey?: string | null };

export type LocalRow = {
  /** Populated by the retained reader; legacy presentation fixtures may omit it. */
  retainedChecks?: number;
  baselineWindow?: RankReportTarget["baselineWindow"];
  keywordId: string;
  text: string;
  presence: ResolvedMeasurement;
  target: ResolvedMeasurement;
  reasons: readonly string[];
};
export type LocalReport = {
  asOf: string;
  selectionDigest: string;
  subject: { locationId: string; name: string; identityRevisionId: string; matcherVersion: string };
  membership: "current_active_assignment_cohort";
  comparison: "baseline_membership_unavailable";
  expected: number;
  excluded: number;
  retainedChecks: number;
  presence: MeasurementReport;
  targetTop3: MeasurementReport;
  conditionalTop3: MeasurementReport;
  averageFoundSlot: number | null;
  averageFoundCount: number;
  matchCoverage: number | null;
  rows: readonly LocalRow[];
};
export type LocalDashboardContext = {
  state: "ready" | "missing" | "invalid" | "unavailable" | "capacity";
  choices: readonly { label: string; selection: DashboardLocalSelection }[];
  selection: DashboardLocalSelection | null;
};
export type LocalExpectedMetadata = {
  expectedScope: MeasurementScope | null;
  freshForMs?: number | null;
  baselineWindow?: RankReportTarget["baselineWindow"];
};
