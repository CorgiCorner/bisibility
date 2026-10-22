import type { ProjectRun } from "@/lib/runs/project-run";
import { useTranslations } from "next-intl";

export function RunStatusSummary({
  run,
  progress = true,
}: Readonly<{ run: ProjectRun; progress?: boolean }>) {
  const t = useTranslations("projectRuns.table");
  let reason: string | null = null;
  if (run.kind === "rank" && run.details.status === "blocked") {
    const reasons = {
      budget_exhausted: "reviewUsage",
      budget_missing: "reviewUsage",
      usage_reconciliation_required: "usageUnconfirmed",
      no_provider: "connectProvider",
      credentials_unavailable: "connectProvider",
      provider_unavailable: "providerUnavailable",
      temporal_unavailable: "workerUnavailable",
      market_inactive: "marketPaused",
      no_active_keywords: "noActiveKeywords",
    } as const;
    const key = reasons[run.details.blockedReason as keyof typeof reasons];
    reason = t(key ?? "reviewBlocker");
  } else if (run.kind === "rank" && run.details.blockedReason === "no_active_keywords") {
    reason = t("noActiveKeywords");
  }
  const { completed, total, unit } = run.progress;
  return (
    <span className="grid min-w-0 gap-0.5 text-[11px] leading-[1.4] text-fg-muted">
      {reason ? <span>{reason}</span> : null}
      {progress ? (
        <span className="tabular-nums">
          {completed === null || total === null
            ? t("notAvailable")
            : t(
                unit === "targets"
                  ? "targetProgress"
                  : unit === "samples"
                    ? "sampleProgress"
                    : "dayProgress",
                { completed, total },
              )}
        </span>
      ) : null}
    </span>
  );
}
