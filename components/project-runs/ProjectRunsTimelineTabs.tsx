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
  if (query?.view !== "timeline") return null;
  return (
    <nav aria-label={t("sections")} className="flex flex-wrap gap-1">
      {(["all", "active", "upcoming", "history"] as const).map((section) => (
        <Link
          aria-current={(query.section ?? "all") === section ? "page" : undefined}
          className={cn(
            "rounded-btn px-3 py-1.5 text-[12px] font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid",
            (query.section ?? "all") === section
              ? "bg-bg-elev text-fg"
              : "text-fg-muted hover:text-fg",
          )}
          href={projectRunsPath(projectRef, { ...query, section, cursor: null })}
          key={section}
        >
          {t(section)}
        </Link>
      ))}
    </nav>
  );
}
