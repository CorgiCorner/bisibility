"use client";

import { KeywordInlineEdit } from "@/components/keywords/grid/KeywordInlineEdit";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { KeywordDetailActions } from "./action-utils";
import { effectiveRowDepth } from "./grid/run-check-depth";
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
  const t = useTranslations("projectRankTracker.keywordDetail.edit");
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
              {t("cancel")}
            </Button>
            {section === "details" ? (
              <Button
                className="flex-1"
                form={detailsFormId}
                loading={saving}
                loadingLabel={t("saving")}
                type="submit"
              >
                {t("saveDetails")}
              </Button>
            ) : (
              <Button className="flex-1" onClick={onChangeSchedule} type="button">
                {t("setSchedule")}
              </Button>
            )}
          </div>
        }
        onClose={handleClose}
        open={open}
        title={
          <span className="block min-w-0">
            <span className="block">{t("title")}</span>
            <span className="mt-1 block truncate text-[12px] font-normal text-fg-muted">
              {keyword.keyword}
            </span>
          </span>
        }
      >
        <SegmentedControl
          ariaLabel={t("section")}
          className="mb-5"
          disabled={saving}
          onChange={setSection}
          options={[
            { label: t("details"), value: "details" },
            { label: t("schedule"), value: "schedule" },
          ]}
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
        <div hidden={section !== "schedule"}>
          <p className="text-[13px] text-fg-muted">{t("scheduleDescription")}</p>
          <div className="mt-5 rounded-control border border-border bg-bg-sunken px-3.5 py-3">
            <div className="font-sans text-[11px] uppercase tracking-[0.5px] text-fg-muted">
              {t("currentSchedule")}
            </div>
            {keyword.checkSchedule ? (
              <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate font-medium text-fg">
                  {keyword.checkSchedule.name}
                </span>
                <span className="shrink-0 tabular-nums text-fg-muted">
                  {t("scheduleDepth", { depth: effectiveRowDepth(keyword) })}
                </span>
              </div>
            ) : (
              <p className="mt-1.5 text-[13px] text-fg-muted">{t("noSchedule")}</p>
            )}
          </div>
        </div>
      </Sheet>
      {scheduleModal}
    </>
  );
}
