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
  if (run.title.kind === "gsc_import") return t("searchConsoleImport");
  if (run.title.trigger === "api") return t("rankCheckApi");
  if (run.title.trigger === "manual") return t("rankCheckManual");
  if (run.title.trigger === "retry") return t("rankCheckRetry");
  return t("rankCheckScheduled");
}

export function scopeLabelFor(
  run: ProjectRun,
  t: ReturnType<typeof useTranslations<"projectRuns.table">>,
) {
  return run.scope.kind === "rank_check"
    ? t("keywordCount", { count: run.scope.keywordCount })
    : t("searchConsole");
}

export function startedAt(run: ProjectRun) {
  return run.kind === "rank_check" ? run.timestamps.startedAt : run.timestamps.syncStartedAt;
}
