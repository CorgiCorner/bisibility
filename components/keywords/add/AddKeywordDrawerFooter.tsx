"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, Switch } from "@/components/ui";
import type { AddKeywordDrawerForm, AddKeywordTab } from "@/lib/keywords/add-keyword-drawer-shared";
import { DatabaseIcon as Database, LightningIcon as Lightning } from "@phosphor-icons/react";
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
      <div className="flex items-start gap-[9px] rounded-[10px] bg-bg-sunken px-[13px] py-[11px]">
        <span className="flex h-[18px] flex-none items-center">
          <Database className="text-accent-text" size={15} weight="bold" />
        </span>
        <p className="m-0 text-[12px] leading-[1.5] text-fg-muted">
          Rankings come from your connected SERP provider. You control cadence and pay the provider
          directly.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {showPauseToggle ? (
          <ProjectReadOnlyTooltip>
            <Switch
              checked={isPaused}
              description="Create these targets paused. You can resume them later."
              disabled={readOnly}
              label="Pause new targets"
              {...register("isPaused")}
            />
          </ProjectReadOnlyTooltip>
        ) : null}
        <ProjectReadOnlyTooltip className="inline-flex flex-1">
          <Button
            disabled={readOnly || submitDisabled}
            form={isReviewMode ? undefined : "add-keyword-form"}
            onClick={isReviewMode ? onReview : undefined}
            startIcon={<Lightning size={14} weight="bold" />}
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
