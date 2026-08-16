import type * as KeywordActions from "@/components/keywords/action-utils";
import type { ImportTopQueriesAction } from "@/components/onboarding/steps/KeywordTopQueryImport";
import type * as FirstCheckActions from "@/components/rank-check/FirstCheckBannerAction";
import type { ActiveLens } from "@/lib/keywords/lens-model";
import type { RankTrackerAction } from "@/lib/keywords/rank-tracker-command";
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
  getFirstCheckRunPlanAction: FirstCheckActions.GetFirstCheckRunPlanAction;
  initialAction?: RankTrackerAction | null;
  initialAddOpen?: boolean;
  initialViewConfig?: SavedViewConfig;
  importTopQueriesAction?: ImportTopQueriesAction;
  keywordDefaults?: ProjectDefaultMarket;
  lens?: ActiveLens;
  providerConnected?: boolean;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  queueFirstChecksAction: FirstCheckActions.QueueFirstChecksAction;
  rows: KeywordRow[];
  runCheckNowAction?: KeywordActions.KeywordDetailActions["runCheckNowAction"];
  savedViews?: KeywordSavedView[];
  tagSuggestions?: readonly string[];
  totalKeywordCount?: number;
  updateKeywordAction: KeywordActions.KeywordDetailActions["updateKeywordAction"];
  updateKeywordScheduleAction?: KeywordActions.KeywordDetailActions["updateKeywordScheduleAction"];
};
