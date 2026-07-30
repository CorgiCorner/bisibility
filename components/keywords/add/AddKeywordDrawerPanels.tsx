"use client";

import type { CsvKeywordReviewItem } from "@/components/keywords/AddKeywordCsvReviewModel";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import {
  ADD_KEYWORD_TABS,
  type AddKeywordDrawerForm,
  type AddKeywordTab,
} from "@/lib/keywords/add-keyword-drawer-shared";
import type { RankCheckFrequency } from "@/lib/settings/options";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { AddKeywordApiPanel } from "./AddKeywordApiPanel";
import { AddKeywordCsvPanel } from "./AddKeywordCsvPanel";
import { AddKeywordCsvReview } from "./AddKeywordCsvReview";
import { AddKeywordManualPanel } from "./AddKeywordManualPanel";
import { AddKeywordTrackingPanel } from "./AddKeywordTrackingPanel";

type AddKeywordDrawerPanelsProps = {
  activeTab: AddKeywordTab;
  count: number;
  csvParseError: string | null;
  csvReviewOpen: boolean;
  csvText: string;
  device: AddKeywordDrawerForm["device"];
  domain?: string;
  errors: FieldErrors<AddKeywordDrawerForm>;
  location: LocationFieldValue;
  onAppendTag: (tag: string) => void;
  onCsvReviewEdit: () => void;
  onCsvTextChange: (value: string) => void;
  onDeviceChange: (value: string) => void;
  onLocationChange: (value: LocationFieldValue) => void;
  onTabChange: (tab: AddKeywordTab) => void;
  onTagsChange: (value: string) => void;
  projectId: string;
  projectDefaultFrequency?: RankCheckFrequency;
  register: UseFormRegister<AddKeywordDrawerForm>;
  reviewItems: CsvKeywordReviewItem[];
  tagSuggestions: readonly string[];
  tagsText: string;
  scheduleFrequency?: RankCheckFrequency | "project_default";
  showSchedule?: boolean;
  onScheduleChange?: (value: string) => void;
};

export function AddKeywordDrawerPanels({
  activeTab,
  count,
  csvParseError,
  csvReviewOpen,
  csvText,
  device,
  domain,
  errors,
  location,
  onAppendTag,
  onCsvReviewEdit,
  onCsvTextChange,
  onDeviceChange,
  onLocationChange,
  onScheduleChange,
  onTabChange,
  onTagsChange,
  projectId,
  projectDefaultFrequency,
  register,
  reviewItems,
  tagSuggestions,
  tagsText,
  scheduleFrequency,
  showSchedule,
}: Readonly<AddKeywordDrawerPanelsProps>) {
  const trackingControls = (
    <AddKeywordTrackingPanel
      device={device}
      errors={errors}
      location={location}
      onDeviceChange={onDeviceChange}
      onLocationChange={onLocationChange}
      onScheduleChange={onScheduleChange}
      projectId={projectId}
      projectDefaultFrequency={projectDefaultFrequency}
      register={register}
      scheduleFrequency={scheduleFrequency}
      showSchedule={showSchedule}
    />
  );

  return (
    <>
      <div className="flex w-max items-center gap-0.5 rounded-[10px] border border-border-strong bg-bg-sunken p-[3px]">
        {ADD_KEYWORD_TABS.map((tab) => (
          <button
            className={`rounded-[7px] px-4 py-1.5 text-[12.5px] font-semibold ${
              activeTab === tab.id ? "bg-bg-elev text-fg" : "text-fg-muted"
            }`}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

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
          trackingControls={trackingControls}
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

      {activeTab === "csv" && !csvReviewOpen ? trackingControls : null}

      {activeTab === "csv" && csvReviewOpen ? (
        <AddKeywordCsvReview items={reviewItems} onEdit={onCsvReviewEdit} />
      ) : null}

      {activeTab === "api" ? <AddKeywordApiPanel projectId={projectId} /> : null}
    </>
  );
}
