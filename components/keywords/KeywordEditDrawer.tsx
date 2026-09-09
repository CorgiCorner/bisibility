"use client";

import { KeywordInlineEdit } from "@/components/keywords/grid/KeywordInlineEdit";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { useState } from "react";
import type { KeywordDetailActions } from "./action-utils";
import { useKeywordScheduleModal } from "./use-keyword-schedule-modal";

type EditSection = "details" | "schedule";

type KeywordEditDrawerProps = Pick<KeywordDetailActions, "updateKeywordAction"> & {
  keyword: KeywordRow;
  focusTargetUrl?: boolean;
  onClose: () => void;
  open: boolean;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
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
  projectMarkets,
  providerRate,
  updateKeywordAction,
}: Readonly<KeywordEditDrawerProps>) {
  const [section, setSection] = useState<EditSection>("details");
  const [saving, setSaving] = useState(false);
  const { onChangeSchedule, scheduleModal } = useKeywordScheduleModal({
    keyword,
    projectId,
    providerRate,
  });
  const detailsFormId = `keyword-details-${keyword.id}`;

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
    <>
      <Sheet
        footer={
          <div className="flex items-center gap-2.5">
            <Button disabled={saving} onClick={handleClose} type="button" variant="secondary">
              Cancel
            </Button>
            {section === "details" ? (
              <Button
                className="flex-1"
                form={detailsFormId}
                loading={saving}
                loadingLabel="Saving..."
                type="submit"
              >
                Save details
              </Button>
            ) : (
              <Button className="flex-1" onClick={onChangeSchedule} type="button">
                Set schedule
              </Button>
            )}
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
        <SegmentedControl
          ariaLabel="Edit section"
          className="mb-5"
          disabled={saving}
          onChange={setSection}
          options={sectionOptions}
          value={section}
        />
        <div hidden={section !== "details"}>
          <KeywordInlineEdit
            focusTargetUrl={focusTargetUrl}
            formId={detailsFormId}
            drawerMarkets={projectMarkets?.markets}
            hideSubmit
            keyword={keyword}
            layout="drawer"
            lockIdentity
            onSaved={handleSaved}
            onSavingChange={setSaving}
            projectId={projectId}
            updateKeywordAction={updateKeywordAction}
          />
        </div>
        <p className="text-[13px] text-fg-muted" hidden={section !== "schedule"}>
          Assign this keyword to a check schedule for the selected target.
        </p>
      </Sheet>
      {scheduleModal}
    </>
  );
}
