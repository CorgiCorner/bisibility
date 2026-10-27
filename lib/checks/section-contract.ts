import type {
  CheckRange,
  CheckRunFilter,
  CheckRunProviderOption,
  CheckRunsView,
  CheckRunTriggerFilter,
  UpcomingView,
} from "./contract";

export type CheckRunsBudget = Pick<UpcomingView, "blocked" | "forecast">;
export type SkippedRunsLinks = {
  connectProviderHref: string;
  reviewProvidersHref: string;
  timelineHref: string;
};
export type CheckRunsHeaderProps = {
  exactRange?: boolean;
  hideAsOfDate?: boolean;
  hideProvider?: boolean;
  asOfDate: string;
  now: Date;
  onAsOfDateChange: (date: string) => void;
  onProviderChange: (provider: string) => void;
  onRangeChange: (range: CheckRange) => void;
  onTriggerChange: (trigger: CheckRunTriggerFilter) => void;
  provider: string;
  providerOptions: readonly CheckRunProviderOption[];
  range: CheckRange;
  timeZone: string;
  trigger: CheckRunTriggerFilter;
};
export type CheckRunsSectionProps = SkippedRunsLinks &
  Omit<CheckRunsHeaderProps, "now"> & {
    budget: CheckRunsBudget;
    budgetSettingsHref: string;
    filter: CheckRunFilter;
    initialExpandedRunIds?: readonly string[];
    keywordHref: (keywordPublicId: string) => string;
    now?: Date;
    onFilterChange: (filter: CheckRunFilter) => void;
    onLoadMore: () => void;
    onRetryFailed?: () => void;
    onRetryStale?: () => void;
    reorderProvidersHref: string;
    view: CheckRunsView;
  };
export type CheckRunsRenderProps = CheckRunsSectionProps & { now: Date };
