import type {
  KeywordDetailActions,
  KeywordWorkspaceActions,
} from "@/components/keywords/action-utils";
import type { DataTableDensity } from "@/components/ui/data-table/data-table-types";
import type { KeywordFilterChip } from "@/lib/keywords/keyword-filter-model";
import type { MarketGridViewRow } from "@/lib/keywords/market-grid-model";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import type { MarketScope } from "@/lib/markets/market-scope";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { SerpDepth } from "@/lib/serp/constants";
import type { ReactNode } from "react";
import type { KeywordNoRowsState } from "./KeywordTableStatus";
import type { CheckHealthView } from "./keywords-grid-types";

export type KeywordDataTableProps = Omit<KeywordWorkspaceActions, "addKeywordsAction"> &
  Pick<KeywordDetailActions, "updateKeywordAction"> & {
    canDeleteKeyword: boolean;
    canUpdateKeyword: boolean;
    checkHealth?: CheckHealthView;
    filterChips: KeywordFilterChip[];
    filterCount: number;
    initialDensity?: DataTableDensity;
    matchedGroupCount?: number;
    matchedTargetCount: number;
    marketScope?: MarketScope | null;
    page: number;
    pageCount: number;
    pageSize: RankTrackerQueryState["pageSize"];
    query: RankTrackerQueryState;
    onAddKeyword?: () => void;
    onClearFilters: () => void;
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
    rankTrackerPath?: string;
    rows: MarketGridViewRow[];
    noRowsState?: KeywordNoRowsState;
    searchValue: string;
    savedViewControl?: ReactNode;
    scopeChip?: ReactNode;
    scopeControl?: ReactNode;
  };
