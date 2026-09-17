"use client";

// The tab strip is rendered both by a client parent (the runs list) and directly by the
// schedules server pages. Its messages come from ProjectRunsFeatureBoundary, a client
// provider, so the strip must resolve them on the client in both placements.

import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import type { ProjectRunsQuery } from "@/lib/runs/filters";
import { cn } from "@/lib/ui/cn";
import Link from "next/link";
import { useTranslations } from "next-intl";

type ProjectRunsTabsProps = {
  active: "runs" | "schedules";
  projectRef: string;
  query?: ProjectRunsQuery;
};

export function ProjectRunsTabs({ active, projectRef, query }: Readonly<ProjectRunsTabsProps>) {
  const t = useTranslations("projectRuns.navigation");
  const tabs = [
    {
      href: projectRunsPath(projectRef, { ...query, cursor: null }),
      label: t("runs"),
      value: "runs",
    },
    { href: projectSchedulesPath(projectRef), label: t("schedules"), value: "schedules" },
  ];

  return (
    <nav aria-label={t("runsSections")} className="flex min-w-0 gap-0.5 border-b border-border">
      {tabs.map((tab) => (
        <Link
          aria-current={active === tab.value ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-semibold no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-solid",
            active === tab.value
              ? "border-accent text-fg"
              : "border-transparent text-fg-muted hover:text-fg",
          )}
          href={tab.href}
          key={tab.value}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
