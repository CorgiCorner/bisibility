"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import type { ProjectRunsQuery } from "@/lib/runs/filters";
import { updateProjectRunsQuery } from "@/lib/runs/filters";
import { useRouter } from "next/navigation";

type ProjectRunsFiltersProps = {
  projectRef: string;
  query: ProjectRunsQuery;
};

const sourceOptions = [
  { label: "All sources", value: "all" },
  { label: "Rank checks", value: "rank_checks" },
  { label: "Search Console", value: "search_console" },
] as const;

const statusOptions = [
  { label: "All statuses", value: "all" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Active", value: "active" },
  { label: "Needs attention", value: "attention" },
  { label: "Finished", value: "finished" },
] as const;

export function ProjectRunsFilters({ projectRef, query }: Readonly<ProjectRunsFiltersProps>) {
  const router = useRouter();
  const navigate = (updates: Partial<ProjectRunsQuery>) =>
    router.push(projectRunsPath(projectRef, updateProjectRunsQuery(query, updates)));

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="project-runs-filters">
      <MenuSelect
        ariaLabel="Run source"
        leadingLabel="Source:"
        onChange={(source) => navigate({ source: source as ProjectRunsQuery["source"] })}
        options={sourceOptions}
        selectedContent={(option) => (option?.value === "all" ? "All" : option?.label)}
        size="toolbar"
        value={query.source}
      />
      <MenuSelect
        ariaLabel="Run status"
        leadingLabel="Status:"
        onChange={(status) =>
          navigate(
            status === "upcoming"
              ? { status: "all", view: "planned" }
              : { status: status as ProjectRunsQuery["status"], view: "runs" },
          )
        }
        options={statusOptions}
        selectedContent={(option) => (option?.value === "all" ? "All" : option?.label)}
        size="toolbar"
        value={query.view === "planned" ? "upcoming" : query.status}
      />
    </div>
  );
}
