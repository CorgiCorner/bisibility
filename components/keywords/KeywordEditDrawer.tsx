"use client";

import { KeywordInlineEdit } from "@/components/keywords/grid/KeywordInlineEdit";
import { Button, SegmentedControl, Sheet } from "@/components/ui";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useState } from "react";
import type { KeywordDetailActions } from "./action-utils";
import { KeywordScheduleInlineForm } from "./KeywordScheduleInlineForm";

type EditSection = "details" | "schedule";

type KeywordEditDrawerProps = Pick<
  KeywordDetailActions,
  "updateKeywordAction" | "updateKeywordScheduleAction"
> & {
  keyword: KeywordRow;
  focusTargetUrl?: boolean;
  onClose: () => void;
  open: boolean;
  projectId: string;
  providerRate?: CostRateInfo;
};

const sectionOptions = [
  { label: "Details", value: "details" },
  { label: "Schedule", value: "schedule" },
] as const;

export function KeywordEditDrawer({
  focusTargetUrl = false,
  keyword,
  onClose,
  open,
  projectId,
  providerRate,
  updateKeywordAction,
  updateKeywordScheduleAction,
}: Readonly<KeywordEditDrawerProps>) {
  const [section, setSection] = useState<EditSection>("details");
  const [saving, setSaving] = useState(false);
  const detailsFormId = `keyword-details-${keyword.id}`;
  const scheduleFormId = `keyword-schedule-${keyword.id}`;
  const activeFormId = section === "details" ? detailsFormId : scheduleFormId;
  const options = updateKeywordScheduleAction ? sectionOptions : sectionOptions.slice(0, 1);

  function handleClose() {
    if (saving) return;
    setSection("details");
    onClose();
  }

  function handleSaved() {
    setSaving(false);
    setSection("details");
    onClose();
  }

  return (
    <Sheet
      footer={
        <div className="flex items-center gap-2.5">
          <Button disabled={saving} onClick={handleClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button
            className="flex-1"
            form={activeFormId}
            loading={saving}
            loadingLabel="Saving..."
            type="submit"
          >
            {section === "details" ? "Save details" : "Save schedule"}
          </Button>
        </div>
      }
      onClose={handleClose}
      open={open}
      title={
        <span className="block min-w-0">
          <span className="block">Edit keyword</span>
          <span className="mt-1 block truncate text-[12px] font-normal text-fg-muted">
            {keyword.keyword}
          </span>
        </span>
      }
    >
      {updateKeywordScheduleAction ? (
        <SegmentedControl
          ariaLabel="Edit section"
          className="mb-5"
          disabled={saving}
          onChange={setSection}
          options={options}
          value={section}
        />
      ) : null}
      <div hidden={section !== "details"}>
        <KeywordInlineEdit
          focusTargetUrl={focusTargetUrl}
          formId={detailsFormId}
          hideSubmit
          keyword={keyword}
          layout="drawer"
          onSaved={handleSaved}
          onSavingChange={setSaving}
          projectId={projectId}
          updateKeywordAction={updateKeywordAction}
        />
      </div>
      {updateKeywordScheduleAction ? (
        <div hidden={section !== "schedule"}>
          <KeywordScheduleInlineForm
            formId={scheduleFormId}
            hideSubmit
            keyword={keyword}
            layout="drawer"
            onSaved={handleSaved}
            onSavingChange={setSaving}
            projectDepth={keyword.projectSerpDepth}
            providerRate={providerRate}
            scheduleDepth={keyword.schedule?.serp_depth}
            updateKeywordScheduleAction={updateKeywordScheduleAction}
          />
        </div>
      ) : null}
    </Sheet>
  );
}
