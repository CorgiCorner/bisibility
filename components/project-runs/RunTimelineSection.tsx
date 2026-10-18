import type { ProjectRunsQuery } from "@/lib/runs/filters";
import type { ProjectRun } from "@/lib/runs/project-run";
import { runTimelineSection } from "@/lib/runs/project-run-time-presentation";
import { useTranslations } from "next-intl";

export function RunTimelineSection({
  run,
  order,
  readAt,
  attention = false,
}: Readonly<{
  run: ProjectRun;
  order: ProjectRunsQuery["order"];
  readAt?: string;
  attention?: boolean;
}>) {
  const t = useTranslations("projectRuns.timeline");
  const section = runTimelineSection(run, readAt);
  const hint =
    section === "history" && attention
      ? "pastFailuresHint"
      : order && order !== "default"
        ? order === "asc"
          ? "oldestFirst"
          : "newestFirst"
        : (`${section}Hint` as const);

  return (
    <span className="flex max-w-full flex-wrap items-baseline gap-x-2 whitespace-normal font-semibold text-fg">
      {t(section)}
      <span className="text-[10.5px] font-normal text-fg-muted">{t(hint)}</span>
    </span>
  );
}
