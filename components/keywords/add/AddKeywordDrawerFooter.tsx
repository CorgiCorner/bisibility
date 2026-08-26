"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, Switch, Tooltip } from "@/components/ui";
import type { AddKeywordDrawerForm, AddKeywordTab } from "@/lib/keywords/add-keyword-drawer-shared";
import type { UseFormRegister } from "react-hook-form";

type AddKeywordDrawerFooterProps = {
  activeTab: AddKeywordTab;
  ctaLabel: string;
  deviceCount: number;
  isPaused: boolean;
  isReviewMode: boolean;
  isSubmitting: boolean;
  keywordCount: number;
  onReview: () => void;
  register: UseFormRegister<AddKeywordDrawerForm>;
  submitDisabled: boolean;
  showPauseToggle?: boolean;
  marketCount: number;
};

export function AddKeywordDrawerFooter({
  activeTab,
  ctaLabel,
  deviceCount,
  isPaused,
  isReviewMode,
  isSubmitting,
  keywordCount,
  onReview,
  register,
  submitDisabled,
  showPauseToggle = true,
  marketCount,
}: Readonly<AddKeywordDrawerFooterProps>) {
  const { readOnly } = useProjectWriteMode();

  return (
    <div className="flex flex-col gap-3">
      {activeTab === "manual" ? (
        <p className="m-0 font-mono text-[11.5px] leading-5 text-fg-muted">
          {keywordCount} {keywordCount === 1 ? "keyword" : "keywords"} x {marketCount}{" "}
          {marketCount === 1 ? "market" : "markets"} x {deviceCount}{" "}
          {deviceCount === 1 ? "device" : "devices"} = {keywordCount * marketCount * deviceCount}{" "}
          checks per run
          {keywordCount > 1 ? "" : " for this keyword"}.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2.5">
        {showPauseToggle ? (
          <ProjectReadOnlyTooltip>
            <Tooltip
              content="Create these targets paused. You can resume them later."
              semantics="description"
            >
              <Switch
                checked={isPaused}
                disabled={readOnly}
                label="Pause schedule"
                {...register("isPaused")}
              />
            </Tooltip>
          </ProjectReadOnlyTooltip>
        ) : null}
        <ProjectReadOnlyTooltip className="inline-flex flex-1 whitespace-nowrap">
          <Button
            disabled={readOnly || submitDisabled}
            form={isReviewMode ? undefined : "add-keyword-form"}
            onClick={isReviewMode ? onReview : undefined}
            sx={{ flex: 1 }}
            type={isReviewMode ? "button" : "submit"}
          >
            {isSubmitting ? "Adding..." : ctaLabel}
          </Button>
        </ProjectReadOnlyTooltip>
      </div>
    </div>
  );
}
