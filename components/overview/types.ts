import type { getOverview } from "@/lib/queries/overview";
import type {
  HighlightNote as OverviewHighlightNote,
  RelativeTime as OverviewRelativeTime,
} from "@/lib/queries/overview-builders";
import type { WorkspaceDataState } from "@/lib/queries/workspace-state";

type OverviewReturn = Awaited<ReturnType<typeof getOverview>>;

export type DataSourceHealth = OverviewReturn["dataSource"];
export type DistributionBucket = OverviewReturn["distribution"][number];
export type HighlightList = OverviewReturn["highlights"][number];
export type HighlightRow = HighlightList["rows"][number];
export type HighlightNote = OverviewHighlightNote;
export type RelativeTime = OverviewRelativeTime;
export type OverviewKpi = OverviewReturn["kpis"][number];
export type TrendPoint = OverviewReturn["trend"][number];
export type TrendTakeaway = OverviewReturn["trendTakeaway"];
export type KpiDeltaTone = OverviewKpi["deltaTone"];
export type OverviewView = Omit<OverviewReturn, "projectReadOnly" | "state"> & {
  projectReadOnly: boolean;
  state: WorkspaceDataState;
};
export type { WorkspaceDataState };
