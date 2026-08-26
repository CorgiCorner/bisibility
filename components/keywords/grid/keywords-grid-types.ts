import type * as KeywordActions from "@/components/keywords/action-utils";
import type { ImportTopQueriesAction } from "@/components/onboarding/steps/KeywordTopQueryImport";
import type * as FirstCheckActions from "@/components/rank-check/FirstCheckBannerAction";
import type { ActiveLens, LensLocationOption } from "@/lib/keywords/lens-model";
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
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { ProjectDefaultMarket } from "@/lib/serp/default-market";
import type { GridDensity } from "@mui/x-data-grid";
import type { CheckHealthView } from "./KeywordGridHealthNotices";

export type KeywordsGridProps = KeywordActions.KeywordWorkspaceActions & {
  activeViewId?: string | null;
  canCreateKeyword: boolean;
  canDeleteKeyword: boolean;
  canManageProviders: boolean;
  canUpdateKeyword: boolean;
  checkHealth?: CheckHealthView;
  costContext?: ProjectCostContext;
  createSavedViewAction?: (input: CreateSavedViewInput) => Promise<KeywordSavedView>;
  deletableSavedViewIds: readonly string[];
  deleteSavedViewAction?: (input: DeleteSavedViewInput) => Promise<unknown>;
  facets?: RankTrackerListFacets;
  getFirstCheckRunPlanAction: FirstCheckActions.GetFirstCheckRunPlanAction;
  initialAction?: RankTrackerAction | null;
  initialDensity?: GridDensity;
  initialAddOpen?: boolean;
  initialViewConfig?: SavedViewConfig;
  importTopQueriesAction?: ImportTopQueriesAction;
  keywordDefaults?: ProjectDefaultMarket;
  lens?: ActiveLens;
  listMode?: "flat-server" | "grouped-client";
  locations?: LensLocationOption[];
  matchedTargetCount?: number;
  page?: number;
  pageCount?: number;
  pageSize?: RankTrackerQueryState["pageSize"];
  providerConnected?: boolean;
  projectId: string;
  searchConsoleConnected?: boolean;
  projectMarkets?: ProjectMarketsView;
  query?: RankTrackerQueryState;
  queueFirstChecksAction: FirstCheckActions.QueueFirstChecksAction;
  rows: KeywordRow[];
  runCheckNowAction?: KeywordActions.KeywordDetailActions["runCheckNowAction"];
  savedViews?: KeywordSavedView[];
  tagSuggestions?: readonly string[];
  totalCount?: number;
  totalKeywordCount?: number;
  updateKeywordAction: KeywordActions.KeywordDetailActions["updateKeywordAction"];
  updateKeywordScheduleAction?: KeywordActions.KeywordDetailActions["updateKeywordScheduleAction"];
};
