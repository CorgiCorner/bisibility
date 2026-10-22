"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/ToggleGroup";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { PROJECT_RUNS_SECTIONS, type ProjectRunsQuery } from "@/lib/runs/filters";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type TimelineTabsProps = Readonly<{ projectRef: string; query?: ProjectRunsQuery }>;

export function ProjectRunsTimelineTabs({ projectRef, query }: TimelineTabsProps) {
  const router = useRouter();
  if (!query || query.view === "runs") return null;
  return (
    <ProjectRunsTimelineControls
      query={query}
      onQueryChange={(next) => router.push(projectRunsPath(projectRef, next))}
    />
  );
}

export function ProjectRunsTimelineControls({
  query,
  onQueryChange,
}: Readonly<{
  query: ProjectRunsQuery;
  onQueryChange: (query: ProjectRunsQuery) => void;
}>) {
  const t = useTranslations("projectRuns.timeline");
  const selectedSection = query.view === "planned" ? "upcoming" : (query.section ?? "all");
  const navigate = (updates: Partial<ProjectRunsQuery>) =>
    onQueryChange({
      ...query,
      view: "timeline",
      section: selectedSection,
      ...updates,
      cursor: null,
    });

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="min-w-0 max-w-full overflow-x-auto">
        <ToggleGroup
          aria-label={t("sections")}
          type="single"
          value={selectedSection}
          onValueChange={(value) => {
            const section = PROJECT_RUNS_SECTIONS.find((section) => section === value);
            if (section) navigate({ section });
          }}
        >
          {PROJECT_RUNS_SECTIONS.map((section) => (
            <ToggleGroupItem key={section} value={section}>
              {t(section)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}
