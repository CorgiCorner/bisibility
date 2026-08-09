"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, Switch } from "@/components/ui";
import {
  formatEstimateCents,
  monthlyCostCentsFor,
  scheduledRunsPerMonth,
} from "@/lib/cost-estimate/project-estimate";
import type { AddKeywordDrawerForm, AddKeywordTab } from "@/lib/keywords/add-keyword-drawer-shared";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import { frequencyOptions } from "@/lib/settings/options";
import { DatabaseIcon as Database, LightningIcon as Lightning } from "@phosphor-icons/react";
import type { UseFormRegister } from "react-hook-form";

type AddKeywordDrawerFooterProps = {
  activeTab: AddKeywordTab;
  costContext?: ProjectCostContext;
  count: number;
  ctaLabel: string;
  isPaused: boolean;
  isReviewMode: boolean;
  isSubmitting: boolean;
  onReview: () => void;
  register: UseFormRegister<AddKeywordDrawerForm>;
  submitDisabled: boolean;
  showPauseToggle?: boolean;
  frequencyOverride?: ProjectCostContext["rawFrequency"];
};

function frequencyLabel(value: ProjectCostContext["rawFrequency"]) {
  return frequencyOptions.find((option) => option.value === value)?.label ?? value;
}

function AddKeywordCostEstimate({
  activeTab,
  context,
  count,
  isPaused,
  frequencyOverride,
}: Readonly<{
  activeTab: AddKeywordTab;
  context?: ProjectCostContext;
  count: number;
  isPaused: boolean;
  frequencyOverride?: ProjectCostContext["rawFrequency"];
}>) {
  if (!context || activeTab === "api") return null;
  const deltaFrequency = frequencyOverride ?? context.rawFrequency;
  const rate = { overrideCents: context.costPerCheckCents, providerId: context.providerId };
  const baseVolume = {
    cronExpression: context.cronExpression,
    depth: context.depth,
    frequency: context.rawFrequency,
  };
  const baseScheduledZero = context.rawFrequency === "manual" || context.rawFrequency === "paused";
  const baseCost = baseScheduledZero
    ? 0
    : monthlyCostCentsFor(
        {
          ...baseVolume,
          deviceCount: context.deviceCount,
          keywordCount: context.keywordCount,
          locationCount: context.locationCount,
        },
        rate,
      );
  const deltaScheduledZero = deltaFrequency === "manual" || deltaFrequency === "paused";
  const deltaCost = isPaused
    ? 0
    : deltaScheduledZero
      ? 0
      : monthlyCostCentsFor(
          {
            ...baseVolume,
            deviceCount: 1,
            frequency: deltaFrequency,
            keywordCount: count,
            locationCount: 1,
          },
          rate,
        );
  const projectCost = baseCost == null || deltaCost == null ? null : baseCost + deltaCost;
  const label = frequencyLabel(deltaFrequency);
  const customCronUnknown =
    deltaFrequency === "custom_cron" &&
    scheduledRunsPerMonth(deltaFrequency, context.cronExpression) == null;

  return (
    <p className="m-0 font-mono text-[11.5px] leading-5 text-fg-muted">
      {customCronUnknown
        ? `Adding ${count} ${count === 1 ? "keyword" : "keywords"} at ${label} - estimate excludes custom cron schedule.`
        : deltaCost == null
          ? `Adding ${count} ${count === 1 ? "keyword" : "keywords"}, 1 location, ${label.toLowerCase()}.`
          : projectCost == null
            ? `Adding ${count} ${count === 1 ? "keyword" : "keywords"} at ${label} ~ +${formatEstimateCents(deltaCost)}/mo${isPaused ? " (paused)" : ""} - project total unavailable.`
            : `Adding ${count} ${count === 1 ? "keyword" : "keywords"} at ${label} ~ +${formatEstimateCents(deltaCost)}/mo${isPaused ? " (paused)" : ""} - project total ${deltaScheduledZero ? "scheduled spend " : "~ "}${formatEstimateCents(projectCost)}/mo of ${formatEstimateCents(context.capCents)} cap.`}
    </p>
  );
}

export function AddKeywordDrawerFooter({
  activeTab,
  ctaLabel,
  costContext,
  count,
  isPaused,
  isReviewMode,
  isSubmitting,
  onReview,
  register,
  submitDisabled,
  showPauseToggle = true,
  frequencyOverride,
}: Readonly<AddKeywordDrawerFooterProps>) {
  const { readOnly } = useProjectWriteMode();

  return (
    <div className="flex flex-col gap-3">
      <AddKeywordCostEstimate
        activeTab={activeTab}
        context={costContext}
        count={count}
        isPaused={isPaused}
        frequencyOverride={frequencyOverride}
      />
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
              disabled={readOnly}
              label="Paused"
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
