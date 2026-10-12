"use client";

import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import type { CostEstimateState } from "./useCostEstimate";

export function EstimateStatus({ state }: Readonly<{ state: CostEstimateState }>) {
  const t = useTranslations("projectCostEstimate.status");
  // The status inherits the summary's type, and its first line sits level with the summary icon.
  // The minimum height matches the two-line estimate, so the panel keeps its size when the
  // estimate arrives.
  return (
    <div className="min-h-10 text-fg-muted" role="status">
      {state.status === "error" ? (
        <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <span>{t("unavailable")}</span>
          {/* A text action fits the line, where the loaded estimate shows its link. */}
          <Button
            className="!h-auto !min-h-0 !p-0 font-medium text-accent-text hover:underline"
            variant="ghost"
            size="xs"
            onClick={state.retry}
            type="button"
          >
            {t("retry")}
          </Button>
        </span>
      ) : (
        t("updating")
      )}
    </div>
  );
}
