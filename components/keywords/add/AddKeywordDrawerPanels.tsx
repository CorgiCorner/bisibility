"use client";

import type { CsvKeywordReviewItem } from "@/components/keywords/AddKeywordCsvReviewModel";
import { SegmentedControl } from "@/components/ui";
import {
  ADD_KEYWORD_TABS,
  type AddKeywordDrawerForm,
  type AddKeywordTab,
} from "@/lib/keywords/add-keyword-drawer-shared";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { SerpDevice } from "@/lib/serp/markets";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { AddKeywordApiPanel } from "./AddKeywordApiPanel";
import { AddKeywordCsvPanel } from "./AddKeywordCsvPanel";
import { AddKeywordCsvReview } from "./AddKeywordCsvReview";
import { AddKeywordManualPanel } from "./AddKeywordManualPanel";
import { ProjectMarketsSelector } from "./ProjectMarketsSelector";

type AddKeywordDrawerPanelsProps = {
  activeTab: AddKeywordTab;
  count: number;
  csvParseError: string | null;
  csvReviewOpen: boolean;
  csvText: string;
  domain?: string;
  errors: FieldErrors<AddKeywordDrawerForm>;
  initialDevices?: readonly SerpDevice[];
  initialMarketKeys: readonly string[];
  onAppendTag: (tag: string) => void;
  onCsvReviewEdit: () => void;
  onCsvTextChange: (value: string) => void;
  onMatrixChange: (value: { devices: SerpDevice[]; locationKeys: string[] }) => void;
  onTabChange: (tab: AddKeywordTab) => void;
  onTagsChange: (value: string) => void;
  projectId: string;
  defaultDevice: SerpDevice;
  projectMarkets: ProjectMarketsView;
  register: UseFormRegister<AddKeywordDrawerForm>;
  reviewItems: CsvKeywordReviewItem[];
  tagSuggestions: readonly string[];
  tagsText: string;
};

export function AddKeywordDrawerPanels({
  activeTab,
  count,
  csvParseError,
  csvReviewOpen,
  csvText,
  domain,
  errors,
  initialDevices,
  initialMarketKeys,
  onAppendTag,
  onCsvReviewEdit,
  onCsvTextChange,
  onMatrixChange,
  onTabChange,
  onTagsChange,
  projectId,
  defaultDevice,
  projectMarkets,
  register,
  reviewItems,
  tagSuggestions,
  tagsText,
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
          trackingControls={
            <ProjectMarketsSelector
              defaultDevice={defaultDevice}
              initialDevices={initialDevices}
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

      {activeTab === "csv" && csvReviewOpen ? (
        <AddKeywordCsvReview items={reviewItems} onEdit={onCsvReviewEdit} />
      ) : null}

      {activeTab === "api" ? <AddKeywordApiPanel projectId={projectId} /> : null}
    </>
  );
}
