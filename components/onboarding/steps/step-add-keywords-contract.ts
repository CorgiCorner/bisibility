import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { OnboardingFlowState } from "@/components/onboarding/onboarding-fixtures";
import type { RankedKeywordConnection } from "@/lib/ranked-keywords/service";
import type { AddKeywordsMatrixInput } from "@/lib/schemas/keyword";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import type { SharedErrorMessages } from "@/lib/ui/action-error";
import { classifyActionError, presentActionError } from "@/lib/ui/action-error";
import type { FetchRankedKeywordSuggestionsAction } from "./KeywordRankedImport";
import type { ImportTopQueriesAction } from "./KeywordTopQueryImport";
import type {
  CreateOnboardingMarketAction,
  SaveOnboardingMarketsAction,
} from "./onboarding-market-actions";
import type { AddKeywordsForm } from "./step-add-keywords-model";
import type { OnboardingTrackingDefaultsInput } from "./step-schedule-model";

export type AddKeywordsInput = AddKeywordsMatrixInput;

type CreatedKeyword = { id: string; publicId: string };

export type StepAddKeywordsProps = {
  addKeywordsAction?: (input: AddKeywordsInput) => Promise<{
    created: number;
    persistedKeywordCount: number;
    keywords: CreatedKeyword[];
    skippedDuplicates: number;
    warnings?: string[];
  }>;
  calculatorPath?: string;
  costPerCheckCents?: number | null;
  /** Creates a market through the shared contract; absent until the project exists. */
  createMarketAction?: CreateOnboardingMarketAction;
  defaultValues?: AddKeywordsForm;
  fetchRankedKeywordSuggestionsAction?: FetchRankedKeywordSuggestionsAction;
  flowState?: OnboardingFlowState;
  hasAnalyticsSource?: boolean;
  importTopQueriesAction?: ImportTopQueriesAction;
  monthlyCapCents?: number;
  onComplete?: (
    values: AddKeywordsForm,
    defaults: OnboardingTrackingDefaultsInput,
    keywordCount: number,
    warning?: string | null,
  ) => void | Promise<void>;
  onKeywordsChange?: (keywords: string) => void;
  onSavingChange?: (saving: boolean) => void;
  /** The markets as the step tracks them, server names included, for the wizard's draft. */
  onMarketsChange?: (locations: LocationFieldValue[]) => void;
  projectDomain?: string;
  rankedKeywordConnections?: RankedKeywordConnection[];
  saveMarketsAction?: SaveOnboardingMarketsAction;
  trackingDefaults?: OnboardingTrackingDefaultsInput;
  updateProjectDefaultsAction?: (input: ProjectDefaultsInput) => Promise<unknown>;
};

export function keywordSetupActionError(
  error: unknown,
  sharedErrors: SharedErrorMessages,
  fallback: string,
) {
  const classified = classifyActionError(error);
  if (classified.kind === "staleDeployment" || classified.kind === "serverComponentDigest") {
    return presentActionError(error, sharedErrors, fallback);
  }
  return fallback;
}
