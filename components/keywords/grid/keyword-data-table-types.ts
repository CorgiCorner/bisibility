import type {
  KeywordDetailActions,
  KeywordWorkspaceActions,
} from "@/components/keywords/action-utils";
import type { KeywordFilterChip } from "@/lib/keywords/keyword-filter-model";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { SerpDepth } from "@/lib/serp/markets";
import type { GridDensity } from "@mui/x-data-grid";
import type { ReactNode } from "react";
import type { CheckHealthView } from "./KeywordGridHealthNotices";
import type { KeywordNoRowsState } from "./KeywordTableStatus";

declare module "@mui/x-data-grid" {
  interface NoRowsOverlayPropsOverrides {
    state?: KeywordNoRowsState;
  }
}

export type KeywordDataTableProps = Omit<KeywordWorkspaceActions, "addKeywordsAction"> &
  Pick<KeywordDetailActions, "updateKeywordAction"> & {
    canDeleteKeyword: boolean;
    canUpdateKeyword: boolean;
    checkFailed: boolean;
    checkHealth?: CheckHealthView;
    filterChips: KeywordFilterChip[];
    filterCount: number;
    initialDensity?: GridDensity;
    listMode?: "flat-server" | "grouped-client";
    marketScope?: MarketScope | null;
    matchedTargetCount?: number;
    page?: number;
    pageCount?: number;
    pageSize?: RankTrackerQueryState["pageSize"];
    query?: RankTrackerQueryState;
    onAddKeyword?: () => void;
    onClearFilters: () => void;
    onDismissFailure: () => void;
    onImportCsv?: () => void;
    onOpenExport: (selectedIds: string[]) => void;
    onOpenFilters: () => void;
    onRemoveFilter: (key: string) => void;
    onQueryNavigation?: () => void;
    onRunChecks: (keywordIds: string[], depth?: SerpDepth) => void;
    onSearchChange: (value: string) => void;
    onSearchCommit?: () => void;
    pendingCheckIds: ReadonlySet<string>;
    providerConnected?: boolean;
    projectId: string;
    projectMarkets?: ProjectMarketsView;
    rows: KeywordRow[];
    noRowsState?: KeywordNoRowsState;
    searchValue: string;
    savedViewControl?: ReactNode;
    scopeChip?: ReactNode;
    scopeControl?: ReactNode;
  };
