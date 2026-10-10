import type { ProjectRunsQuery } from "@/lib/runs/filters";
import type { ProjectRun } from "@/lib/runs/project-run";
import { projectRunTimelineGroup } from "@/lib/runs/project-runs-timeline";
import { useTranslations } from "next-intl";

export function RunTimelineSection({
  run,
  order,
}: Readonly<{ run: ProjectRun; order: ProjectRunsQuery["order"] }>) {
  const t = useTranslations("projectRuns.timeline");
  const group = projectRunTimelineGroup(run);
  const hint =
    order && order !== "default"
      ? order === "asc"
        ? "oldestFirst"
        : "newestFirst"
      : (["activeHint", "upcomingHint", "historyHint"] as const)[group];
  return (
    <span className="flex max-w-full flex-wrap items-baseline gap-x-2 whitespace-normal font-semibold text-fg">
      {t((["active", "upcoming", "history"] as const)[group])}
      <span className="text-[10.5px] font-normal text-fg-muted">
        {t(hint)}
        {group === 1 ? ` ${t("parallelWorkers")}` : ""}
      </span>
    </span>
  );
}
