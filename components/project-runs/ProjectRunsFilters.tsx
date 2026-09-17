"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import type { ProjectRunsQuery } from "@/lib/runs/filters";
import { updateProjectRunsQuery } from "@/lib/runs/filters";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type ProjectRunsFiltersProps = {
  projectRef: string;
  query: ProjectRunsQuery;
};

export function ProjectRunsFilters({ projectRef, query }: Readonly<ProjectRunsFiltersProps>) {
  const t = useTranslations("projectRuns.filters");
  const router = useRouter();
  const navigate = (updates: Partial<ProjectRunsQuery>) =>
    router.push(projectRunsPath(projectRef, updateProjectRunsQuery(query, updates)));
  const sourceOptions = [
    { label: t("allSources"), value: "all" },
    { label: t("rankChecks"), value: "rank_checks" },
    { label: t("searchConsole"), value: "search_console" },
  ] as const;
  const statusOptions = [
    { label: t("allStatuses"), value: "all" },
    { label: t("upcoming"), value: "upcoming" },
    { label: t("active"), value: "active" },
    { label: t("needsAttention"), value: "attention" },
    { label: t("finished"), value: "finished" },
  ] as const;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="project-runs-filters">
      <MenuSelect
        ariaLabel={t("runSource")}
        leadingLabel={t("source")}
        onChange={(source) => navigate({ source: source as ProjectRunsQuery["source"] })}
        options={sourceOptions}
        selectedContent={(option) => (option?.value === "all" ? t("all") : option?.label)}
        size="toolbar"
        value={query.source}
      />
      <MenuSelect
        ariaLabel={t("runStatus")}
        leadingLabel={t("status")}
        onChange={(status) =>
          navigate(
            status === "upcoming"
              ? { status: "all", view: "planned" }
              : { status: status as ProjectRunsQuery["status"], view: "runs" },
          )
        }
        options={statusOptions}
        selectedContent={(option) => (option?.value === "all" ? t("all") : option?.label)}
        size="toolbar"
        value={query.view === "planned" ? "upcoming" : query.status}
      />
    </div>
  );
}
