"use client";

import type { CsvKeywordReviewItem } from "@/components/keywords/AddKeywordCsvReviewModel";
import { ScheduleAssignment } from "@/components/markets/blocks/ScheduleAssignment";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  ADD_KEYWORD_TABS,
  type AddKeywordDrawerForm,
  type AddKeywordTab,
} from "@/lib/keywords/add-keyword-drawer-shared";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { AddKeywordApiPanel } from "./AddKeywordApiPanel";
import { AddKeywordCsvPanel } from "./AddKeywordCsvPanel";
import { AddKeywordCsvReview } from "./AddKeywordCsvReview";
import { AddKeywordManualPanel } from "./AddKeywordManualPanel";
import { AddKeywordTrackingControls } from "./AddKeywordTrackingControls";
import type { useKeywordSuggestionSources } from "./useKeywordSuggestionSources";

const AddKeywordSuggestionsPanel = dynamic(() => import("./AddKeywordSuggestionsPanel"), {
  ssr: false,
});

type AddKeywordDrawerPanelsProps = {
  currentKeywords: string;
  onAppendQueries: (queries: string[]) => void;
  activeTab: AddKeywordTab;
  suggestionSources: ReturnType<typeof useKeywordSuggestionSources>;
  count: number;
  csvParseError: string | null;
  csvReviewOpen: boolean;
  csvText: string;
  domain?: string;
  errors: FieldErrors<AddKeywordDrawerForm>;
  onAppendTag: (tag: string) => void;
  onCsvReviewEdit: () => void;
  onCsvTextChange: (value: string) => void;
  onTabChange: (tab: AddKeywordTab) => void;
  onTagsChange: (value: string) => void;
  projectId: string;
  register: UseFormRegister<AddKeywordDrawerForm>;
  tracking: ComponentProps<typeof AddKeywordTrackingControls>;
  reviewItems: CsvKeywordReviewItem[];
  tagSuggestions: readonly string[];
  tagsText: string;
};

export function AddKeywordDrawerPanels({
  activeTab,
  suggestionSources,
  currentKeywords,
  onAppendQueries,
  count,
  csvParseError,
  csvReviewOpen,
  csvText,
  domain,
  errors,
  onAppendTag,
  onCsvReviewEdit,
  onCsvTextChange,
  onTabChange,
  onTagsChange,
  projectId,
  register,
  reviewItems,
  tagSuggestions,
  tagsText,
  tracking,
}: Readonly<AddKeywordDrawerPanelsProps>) {
  return (
    <>
      <SegmentedControl
        ariaLabel="Add keyword method"
        className="m-0 shrink-0"
        fitContent
        onChange={onTabChange}
        options={ADD_KEYWORD_TABS.map((tab) => ({
          label: tab.label,
          value: tab.id,
        }))}
        size="toolbar"
        value={activeTab}
      />

      {activeTab === "manual" ? (
        <AddKeywordManualPanel
          count={count}
          domain={domain}
          errors={errors}
          onAppendTag={onAppendTag}
          onTagsChange={onTagsChange}
          register={register}
          tagSuggestions={tagSuggestions}
          tagsText={tagsText}
          trackingControls={<AddKeywordTrackingControls {...tracking} />}
        />
      ) : null}

      {activeTab === "csv" && !csvReviewOpen ? (
        <AddKeywordCsvPanel
          csvText={csvText}
          errorMessage={csvParseError ?? errors.keywords?.message}
          onCsvTextChange={onCsvTextChange}
          parsedCount={count}
        />
      ) : null}

      {activeTab === "csv" && csvReviewOpen ? (
        <AddKeywordCsvReview items={reviewItems} onEdit={onCsvReviewEdit} />
      ) : null}

      {activeTab === "csv" ? (
        <ScheduleAssignment
          fixed={
            reviewItems.filter((item) => !item.alreadyTracked && item.issues.length === 0).length
          }
          keywordCount={count}
          onChange={tracking.onScheduleChange}
          onNewSchedule={tracking.onNewSchedule}
          schedules={tracking.schedules}
          selectedId={tracking.scheduleId}
        />
      ) : null}

      {activeTab === "suggestions" ? (
        <AddKeywordSuggestionsPanel
          sourceState={suggestionSources}
          key={projectId}
          currentKeywords={currentKeywords}
          onAppendQueries={onAppendQueries}
          projectId={projectId}
        />
      ) : null}

      {activeTab === "api" ? <AddKeywordApiPanel projectId={projectId} /> : null}
    </>
  );
}
