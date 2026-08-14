"use client";

import type { CsvKeywordReviewItem } from "@/components/keywords/AddKeywordCsvReviewModel";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import {
  ADD_KEYWORD_TABS,
  type AddKeywordDrawerForm,
  type AddKeywordTab,
} from "@/lib/keywords/add-keyword-drawer-shared";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { SerpDevice } from "@/lib/serp/markets";
import type { RankCheckFrequency } from "@/lib/settings/options";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { AddKeywordApiPanel } from "./AddKeywordApiPanel";
import { AddKeywordCsvPanel } from "./AddKeywordCsvPanel";
import { AddKeywordCsvReview } from "./AddKeywordCsvReview";
import { AddKeywordManualPanel } from "./AddKeywordManualPanel";
import { AddKeywordTrackingPanel } from "./AddKeywordTrackingPanel";
import { ProjectMarketsSelector } from "./ProjectMarketsSelector";

type AddKeywordDrawerPanelsProps = {
  activeTab: AddKeywordTab;
  count: number;
  csvParseError: string | null;
  csvReviewOpen: boolean;
  csvText: string;
  device: AddKeywordDrawerForm["device"];
  domain?: string;
  errors: FieldErrors<AddKeywordDrawerForm>;
  initialMarketKeys: readonly string[];
  location: LocationFieldValue;
  onAppendTag: (tag: string) => void;
  onCsvReviewEdit: () => void;
  onCsvTextChange: (value: string) => void;
  onDeviceChange: (value: string) => void;
  onLocationChange: (value: LocationFieldValue) => void;
  onMatrixChange: (value: { devices: SerpDevice[]; locationKeys: string[] }) => void;
  onTabChange: (tab: AddKeywordTab) => void;
  onTagsChange: (value: string) => void;
  projectId: string;
  defaultDevice: SerpDevice;
  projectDefaultFrequency?: RankCheckFrequency;
  projectMarkets: ProjectMarketsView;
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
  initialMarketKeys,
  location,
  onAppendTag,
  onCsvReviewEdit,
  onCsvTextChange,
  onDeviceChange,
  onLocationChange,
  onMatrixChange,
  onScheduleChange,
  onTabChange,
  onTagsChange,
  projectId,
  defaultDevice,
  projectDefaultFrequency,
  projectMarkets,
  register,
  reviewItems,
  tagSuggestions,
  tagsText,
  scheduleFrequency,
  showSchedule,
}: Readonly<AddKeywordDrawerPanelsProps>) {
  const csvTrackingControls = (
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
      <div className="flex w-max items-center gap-0.5 rounded-[10px] border border-border-strong bg-transparent p-[3px]">
        {ADD_KEYWORD_TABS.map((tab) => (
          <button
            className={`rounded-[7px] px-4 py-1.5 text-[12.5px] font-semibold ${
              activeTab === tab.id ? "bg-bg-sunken text-fg" : "text-fg-muted hover:text-fg"
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
          trackingControls={
            <ProjectMarketsSelector
              defaultDevice={defaultDevice}
              initialMarketKeys={initialMarketKeys}
              markets={projectMarkets}
              onChange={onMatrixChange}
              projectId={projectId}
            />
          }
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

      {activeTab === "csv" && !csvReviewOpen ? csvTrackingControls : null}

      {activeTab === "csv" && csvReviewOpen ? (
        <AddKeywordCsvReview items={reviewItems} onEdit={onCsvReviewEdit} />
      ) : null}

      {activeTab === "api" ? <AddKeywordApiPanel projectId={projectId} /> : null}
    </>
  );
}
