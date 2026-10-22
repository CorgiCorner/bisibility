"use client";
import type { projectBudgetExhaustion } from "@usagekit/views";
import type { ProviderAllocationLabels } from "./provider-allocation-policy";
import { UsageStatus } from "./usage-motion";

export function AllocationForecast({
  forecast,
  labels,
  formatTime,
}: {
  forecast: ReturnType<typeof projectBudgetExhaustion>;
  labels: ProviderAllocationLabels;
  formatTime?: (iso: string) => string;
}) {
  return (
    <div className="text-sm flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3">
      <span className="text-fg-muted">{labels.forecast}</span>
      <UsageStatus
        tone={
          forecast.kind === "exhausted"
            ? "exceeded"
            : forecast.kind === "estimated"
              ? "warning"
              : forecast.kind === "within_limits"
                ? "positive"
                : "neutral"
        }
      >
        {forecast.kind === "estimated"
          ? `${labels.estimated} ${formatTime?.(forecast.at) ?? forecast.at}`
          : forecast.kind === "exhausted"
            ? `${labels.exhausted} ${formatTime?.(forecast.at) ?? forecast.at}`
            : forecast.kind === "within_limits"
              ? labels.within
              : forecast.kind === "no_usage"
                ? labels.noUsage
                : labels.forecastUnavailable}
      </UsageStatus>
    </div>
  );
}
