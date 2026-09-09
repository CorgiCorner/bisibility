"use client";

import type { ExistingKeyword } from "@/components/keywords/AddKeywordCsvReviewModel";
import type { KeywordWorkspaceActions } from "@/components/keywords/action-utils";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type {
  AddKeywordDrawerForm,
  AddKeywordEntryTab,
  AddKeywordTab,
} from "@/lib/keywords/add-keyword-drawer-shared";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { SerpDevice } from "@/lib/serp/constants";
import type { RankCheckFrequency } from "@/lib/settings/options";
import type { UseFormSetValue, UseFormWatch } from "react-hook-form";
import type { TrackingScheduleSelection } from "./TrackingConfigurationFields";

export type AddKeywordDrawerProps = Pick<KeywordWorkspaceActions, "addKeywordsAction"> & {
  costContext?: ProjectCostContext;
  defaultDevice?: SerpDevice;
  defaultLocation?: string;
  defaultLocationSelection?: LocationFieldValue;
  domain?: string;
  existingKeywords?: readonly ExistingKeyword[];
  initialDevices?: readonly SerpDevice[];
  initialKeyword?: string;
  initialMarketKeys?: readonly string[];
  initialScheduleFrequency?: TrackingScheduleSelection;
  initialTab?: AddKeywordEntryTab;
  consumeSavedIds?: readonly string[];
  onAdded?: (
    keywords: Array<{ publicId: string; text: string }>,
    context: { locationKeys: readonly string[] },
  ) => void;
  onClose: () => void;
  onExited?: () => void;
  open: boolean;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  showSchedule?: boolean;
  tagSuggestions?: readonly string[];
};

/** What the panel is for, which changes while the nested New market step is open. */
export function addKeywordDrawerDescription(marketStepOpen: boolean, domain?: string) {
  if (marketStepOpen) return "The market is added to the project and selected for these keywords.";
  return domain ? `Track where ${domain} ranks in Google.` : "Track new keywords in Google.";
}

export function trackingScheduleValue(
  frequency: TrackingScheduleSelection | undefined,
  costContext?: ProjectCostContext,
) {
  if (!frequency || frequency === "project_default" || frequency === "custom_cron") {
    return undefined;
  }
  return {
    cronExpression: null,
    frequency,
    jitterMinutes: 60,
    serpDepth: costContext?.depth,
    timezone: costContext?.timezone ?? "UTC",
  };
}

export function trackingScheduleValueWithDepthOverride(
  frequency: TrackingScheduleSelection,
  costContext: ProjectCostContext,
) {
  if (frequency !== "project_default") {
    return trackingScheduleValue(frequency, costContext);
  }
  return {
    cronExpression: costContext.rawFrequency === "custom_cron" ? costContext.cronExpression : null,
    frequency: costContext.rawFrequency,
    jitterMinutes: 60,
    serpDepth: costContext.depth,
    timezone: costContext.timezone ?? "UTC",
  };
}

export function addKeywordDrawerCtaLabel(
  activeTab: AddKeywordTab,
  csvReviewOpen: boolean,
  isPaused: boolean,
) {
  if (activeTab === "csv") return csvReviewOpen ? "Confirm" : "Review keywords";
  if (isPaused) return "Add paused keywords";
  return "Add keywords";
}

export function useAddKeywordTrackingSchedule(
  watch: UseFormWatch<AddKeywordDrawerForm>,
  setValue: UseFormSetValue<AddKeywordDrawerForm>,
  costContext?: ProjectCostContext,
) {
  const scheduleFrequency: RankCheckFrequency | "project_default" =
    watch("schedule")?.frequency ?? "project_default";

  function handleScheduleChange(next: string) {
    if (next === "project_default") {
      setValue("schedule", undefined, { shouldDirty: true, shouldValidate: true });
      return;
    }
    setValue("schedule", trackingScheduleValue(next as TrackingScheduleSelection, costContext), {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  return { handleScheduleChange, scheduleFrequency };
}

export function addedKeywordResult(result: unknown) {
  if (!result || typeof result !== "object" || !("keywords" in result)) return [];
  return Array.isArray(result.keywords)
    ? (result.keywords as Array<{ publicId: string; text: string }>)
    : [];
}
