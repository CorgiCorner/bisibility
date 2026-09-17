"use client";

import { SetupProgressRing } from "@/components/getting-started/SetupProgressRing";
import { useTranslations } from "next-intl";
import {
  type CompletionAcknowledgementMode,
  gettingStartedHeaderProgressModel,
  type SetupProgressSummary,
} from "./getting-started-header-progress";

export type GettingStartedHeaderProgressProps = Readonly<{
  completionMode: CompletionAcknowledgementMode;
  progress: SetupProgressSummary;
  projectRef: string;
}>;

export function GettingStartedHeaderProgress({
  completionMode,
  progress,
}: GettingStartedHeaderProgressProps) {
  const t = useTranslations("projectGettingStarted.header");
  const model = gettingStartedHeaderProgressModel(progress, completionMode);
  const progressLabel = t("progress", {
    settled: model.settledCount,
    total: model.totalCount,
  });

  return (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <div
        className="flex min-w-0 items-center gap-2"
        aria-label={`${t("label")}, ${progressLabel}`}
      >
        <span className="text-[15px] font-semibold leading-[1.35] text-fg">{t("label")}</span>
        <span aria-hidden className="text-[13.5px] leading-[1.35] text-fg-muted">
          ·
        </span>
        <span className="size-[22px] shrink-0" data-testid="setup-progress-indicator">
          <SetupProgressRing
            settledCount={progress.settledCount}
            totalCount={progress.totalCount}
          />
        </span>
        <span className="text-[13.5px] leading-[1.35] text-fg-muted">{progressLabel}</span>
      </div>
    </div>
  );
}
