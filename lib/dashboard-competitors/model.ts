import type { CompetitorScope } from "@/lib/competitors/scope-model";
import type { CompetitorMarket } from "@/lib/competitors/types";
import type { OverviewFilters } from "@/lib/queries/overview-filters";
import type { DashboardComparisonSelection } from "./selection";

export type DashboardComparisonChoice = {
  selection: DashboardComparisonSelection;
  name: string;
  scope: CompetitorScope;
  tag: string | null;
  locationLabel: string;
  languageLabel: string;
};
export type DashboardComparisonReport = {
  asOf: string;
  baselineAsOf: string | null;
  selection: DashboardComparisonSelection;
  selectionRevisionId: string;
  filters: OverviewFilters;
  expectedIds: readonly string[];
  current: CompetitorMarket;
  baseline: CompetitorMarket | null;
  comparableCount: number;
  deltas: readonly { domain: string; percentagePoints: number | null }[];
  population: "frozen_current_filtered_cohort";
};
export type DashboardComparisonContext = {
  state: "ready" | "missing" | "invalid" | "unavailable" | "capacity";
  choices: readonly DashboardComparisonChoice[];
  selection: DashboardComparisonSelection | null;
  report: DashboardComparisonReport | null;
};
