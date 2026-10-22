import type { ProjectRun } from "@/lib/runs/project-run";
import type { useTranslations } from "next-intl";

export function progressFor(
  run: ProjectRun,
  t: ReturnType<typeof useTranslations<"projectRuns.table">>,
) {
  const { completed, total } = run.progress;
  if (completed === null || total === null) return t("notAvailable");
  return t("progressValue", { completed, total });
}

export function titleFor(
  run: ProjectRun,
  t: ReturnType<typeof useTranslations<"projectRuns.table">>,
) {
  if (run.title.kind === "ai") return t("aiTrackingRun");
  if (run.title.kind === "gsc") return t("searchConsoleImport");
  if (run.title.trigger === "api") return t("rankCheckApi");
  if (run.title.trigger === "manual") return t("rankCheckManual");
  if (run.title.trigger === "retry") return t("rankCheckRetry");
  return t("rankCheckScheduled");
}

export function scopeLabelFor(
  run: ProjectRun,
  t: ReturnType<typeof useTranslations<"projectRuns.table">>,
) {
  if (run.kind === "ai") return t("sampleCount", { count: run.progress.total ?? 0 });
  return run.scope.kind === "rank"
    ? t("keywordCount", { count: run.scope.keywordCount })
    : t("searchConsole");
}

export function startedAt(run: ProjectRun) {
  return run.timestamps.startedAt;
}
