import type * as KeywordActions from "@/components/keywords/action-utils";
import type { ImportTopQueriesAction } from "@/components/onboarding/steps/KeywordTopQueryImport";
import type * as FirstCheckActions from "@/components/rank-check/FirstCheckBannerAction";
import type { DataTableDensity } from "@/components/ui/data-table/data-table-types";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { ActiveLens, LensLocationOption } from "@/lib/keywords/lens-model";
import type { MarketGridViewRow } from "@/lib/keywords/market-grid-model";
import type { RankTrackerAction } from "@/lib/keywords/rank-tracker-command";
import type {
  RankTrackerListFacets,
  RankTrackerQueryState,
} from "@/lib/keywords/rank-tracker-query-types";
import type {
  CreateSavedViewInput,
  DeleteSavedViewInput,
  KeywordSavedView,
  SavedViewConfig,
} from "@/lib/keywords/saved-view-model";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { ProjectDefaultMarket } from "@/lib/serp/default-market";

export type CheckHealthView = {
  budget: { capCents: number; exhausted: boolean; spentCents: number };
  failed24h: {
    count: number;
    latest: {
      error: string | null;
      errorCode: string | null;
      keyword: string;
      provider: string;
    } | null;
  };
  providerRate: CostRateInfo;
};

export type KeywordsGridProps = KeywordActions.KeywordWorkspaceActions & {
  activeViewId?: string | null;
  canCreateKeyword: boolean;
  canDeleteKeyword: boolean;
  canManageProviders: boolean;
  canUpdateKeyword: boolean;
  checkHealth?: CheckHealthView;
  costContext?: ProjectCostContext;
  createSavedViewAction?: (input: CreateSavedViewInput) => Promise<KeywordSavedView>;
  /** A rank-check run a notification linked to, echoed back so the market slice can be stated. */
  deepLinkRunId?: string | null;
  deletableSavedViewIds: readonly string[];
  deleteSavedViewAction?: (input: DeleteSavedViewInput) => Promise<unknown>;
  facets?: RankTrackerListFacets;
  getFirstCheckRunPlanAction: FirstCheckActions.GetFirstCheckRunPlanAction;
  initialAction?: RankTrackerAction | null;
  initialDensity?: DataTableDensity;
  initialAddOpen?: boolean;
  initialViewConfig?: SavedViewConfig;
  importTopQueriesAction?: ImportTopQueriesAction;
  keywordDefaults?: ProjectDefaultMarket;
  lens: ActiveLens;
  locations: LensLocationOption[];
  matchedGroupCount?: number;
  matchedTargetCount: number;
  page: number;
  pageCount: number;
  pageSize: RankTrackerQueryState["pageSize"];
  providerConnected?: boolean;
  projectId: string;
  searchConsoleConnected?: boolean;
  projectMarkets?: ProjectMarketsView;
  query: RankTrackerQueryState;
  queueFirstChecksAction: FirstCheckActions.QueueFirstChecksAction;
  rows: MarketGridViewRow[];
  runCheckNowAction?: KeywordActions.KeywordDetailActions["runCheckNowAction"];
  savedViews?: KeywordSavedView[];
  tagSuggestions?: readonly string[];
  totalCount?: number;
  updateKeywordAction: KeywordActions.KeywordDetailActions["updateKeywordAction"];
};
