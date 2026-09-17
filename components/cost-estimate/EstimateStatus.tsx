"use client";

import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import type { CostEstimateState } from "./useCostEstimate";

export function EstimateStatus({ state }: Readonly<{ state: CostEstimateState }>) {
  const t = useTranslations("projectCostEstimate.status");
  return (
    <div className="flex min-h-10 items-center gap-3 text-sm text-fg-muted" role="status">
      {state.status === "error" ? (
        <>
          <span>{t("unavailable")}</span>
          <Button onClick={state.retry} size="sm" type="button" variant="secondary">
            {t("retry")}
          </Button>
        </>
      ) : (
        t("updating")
      )}
    </div>
  );
}
