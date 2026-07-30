"use client";

import type { ExistingKeyword } from "@/components/keywords/AddKeywordCsvReviewModel";
import type { KeywordWorkspaceActions } from "@/components/keywords/action-utils";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import type { AddKeywordDrawerForm, AddKeywordTab } from "@/lib/keywords/add-keyword-drawer-shared";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { SerpDevice } from "@/lib/serp/markets";
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
  initialKeyword?: string;
  initialScheduleFrequency?: TrackingScheduleSelection;
  initialTab?: AddKeywordTab;
  consumeSavedIds?: readonly string[];
  onAdded?: (keywords: Array<{ publicId: string; text: string }>) => void;
  onClose: () => void;
  open: boolean;
  projectId: string;
  showSchedule?: boolean;
  tagSuggestions?: readonly string[];
};

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

export function addKeywordDrawerCtaLabel(
  activeTab: AddKeywordTab,
  csvReviewOpen: boolean,
  isPaused: boolean,
  count: number,
) {
  if (activeTab === "csv") return csvReviewOpen ? "Confirm" : "Review keywords";
  if (isPaused) return count > 1 ? `Add ${count} paused` : "Add paused";
  return count > 1 ? `Add & track ${count} keywords` : "Add & track";
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
