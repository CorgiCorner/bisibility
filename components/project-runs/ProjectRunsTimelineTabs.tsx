"use client";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import type { ProjectRunsQuery } from "@/lib/runs/filters";
import { cn } from "@/lib/ui/cn";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function ProjectRunsTimelineTabs({
  projectRef,
  query,
}: Readonly<{ projectRef: string; query?: ProjectRunsQuery }>) {
  const t = useTranslations("projectRuns.timeline");
  if (!query || query.view === "runs") return null;
  const selectedSection = query.view === "planned" ? "upcoming" : (query.section ?? "all");
  return (
    <div className="flex flex-wrap gap-2">
      <nav aria-label={t("sections")} className="flex flex-wrap gap-1">
        {(["all", "active", "upcoming", "history"] as const).map((section) => (
          <Link
            aria-current={
              selectedSection === section
                ? query.status === "attention" || query.view === "planned"
                  ? "true"
                  : "page"
                : undefined
            }
            className={cn(
              "rounded-btn px-3 py-1.5 text-[12px] font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid",
              selectedSection === section ? "bg-bg-elev text-fg" : "text-fg-muted hover:text-fg",
            )}
            href={projectRunsPath(projectRef, {
              ...query,
              view: "timeline",
              section,
              status: query.status === "attention" ? "all" : query.status,
              cursor: null,
            })}
            key={section}
          >
            {t(section)}
          </Link>
        ))}
      </nav>
      <Link
        aria-current={query.status === "attention" ? "page" : undefined}
        className={cn(
          "rounded-btn px-3 py-1.5 text-[12px] font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid",
          query.status === "attention" ? "bg-bg-elev text-fg" : "text-fg-muted hover:text-fg",
        )}
        href={projectRunsPath(projectRef, {
          ...query,
          view: "timeline",
          status: "attention",
          cursor: null,
        })}
      >
        {t("attention")}
      </Link>
    </div>
  );
}
