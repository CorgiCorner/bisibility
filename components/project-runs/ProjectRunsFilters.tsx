"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import type { ProjectRunsQuery, ProjectRunsStatus } from "@/lib/runs/filters";
import { updateProjectRunsQuery } from "@/lib/runs/filters";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  statusMenuSelection,
  statusMenuValue,
  statusMenuValueFor,
  statusSurvivesSource,
} from "./project-runs-status-menu";
import { type RunStatusSource, useRunStatusCopy } from "./run-status-copy";

type ProjectRunsFiltersProps = {
  projectRef: string;
  query: ProjectRunsQuery;
};

export function ProjectRunsFilters({ projectRef, query }: Readonly<ProjectRunsFiltersProps>) {
  const t = useTranslations("projectRuns.filters");
  const statusCopy = useRunStatusCopy();
  const router = useRouter();
  const navigate = (updates: Partial<ProjectRunsQuery>) =>
    router.push(projectRunsPath(projectRef, updateProjectRunsQuery(query, updates)));
  const sourceOptions = [
    { label: t("allSources"), value: "all" },
    { label: t("rankChecks"), value: "rank_checks" },
    { label: t("searchConsole"), value: "search_console" },
  ] as const;
  const groupLabels: Record<RunStatusSource, string> = {
    rank_checks: t("rankChecks"),
    search_console: t("searchConsole"),
  };
  const statusGroups = [
    {
      hideHeading: true,
      id: "all",
      label: t("allStatuses"),
      options: [
        { label: t("allStatuses"), value: "all" },
        { label: t("needsAttention"), value: "attention" },
      ],
    },
    ...statusCopy.groups
      .filter((group) => query.source === "all" || query.source === group.source)
      .map((group) => ({
        id: group.source,
        label: groupLabels[group.source],
        options: group.entries.map((entry) => ({
          label: entry.label,
          value: statusMenuValue(group.source, entry.key),
        })),
      })),
  ];
  const legacyGroupLabels: Partial<Record<ProjectRunsStatus, string>> = {
    active: t("active"),
    attention: t("needsAttention"),
    finished: t("finished"),
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="project-runs-filters">
      <MenuSelect
        ariaLabel={t("runSource")}
        leadingLabel={t("source")}
        onChange={(value) => {
          const source = value as ProjectRunsQuery["source"];
          navigate(
            statusSurvivesSource(query.status, source) ? { source } : { source, status: "all" },
          );
        }}
        options={sourceOptions}
        selectedContent={(option) => (option?.value === "all" ? t("all") : option?.label)}
        size="toolbar"
        value={query.source}
      />
      <MenuSelect
        ariaLabel={t("runStatus")}
        groups={statusGroups}
        leadingLabel={t("status")}
        onChange={(value) => navigate({ ...statusMenuSelection(value), view: "timeline" })}
        selectedContent={(option) => {
          if (query.view === "planned") return statusCopy.rank("planned").label;
          if (!option || option.value === "all") return legacyGroupLabels[query.status] ?? t("all");
          return option.label;
        }}
        size="toolbar"
        value={query.view === "planned" ? "all" : statusMenuValueFor(query)}
      />
    </div>
  );
}
