"use client";

import { AlertBanner } from "@/components/ui/AlertBanner";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import Link from "next/link";
import { useTranslations } from "next-intl";

export type SchedulerUpgradeIssue = { keywordId: string; keywordText: string };

export function SchedulerUpgradeBanner({
  issues,
  projectId,
}: Readonly<{ issues: readonly SchedulerUpgradeIssue[]; projectId: string }>) {
  const t = useTranslations("shared.schedulerUpgrade");
  if (!issues.length) return null;
  const projectRef = asProjectRef(projectId);
  return (
    <section
      aria-label={t("title", { count: issues.length })}
      className="mx-4 my-3 overflow-hidden rounded-control border border-border-strong bg-bg-elev"
    >
      <AlertBanner
        tint="yellow"
        title={t("title", { count: issues.length })}
        detail={t("detail")}
        action={{ label: t("schedules"), href: projectSchedulesPath(projectRef), icon: "arrow" }}
      />
      <details className="border-t border-border-strong px-4 py-3 text-sm">
        <summary className="cursor-pointer text-fg-muted">{t("review")}</summary>
        <ul className="mt-2 grid max-h-64 gap-2 overflow-auto">
          {issues.map((issue) => (
            <li className="break-words" key={issue.keywordId}>
              <Link
                className="underline"
                href={appPath(projectRef, "rank-tracker", issue.keywordId)}
              >
                {issue.keywordText}
              </Link>
              <span className="ml-2 text-fg-muted">{issue.keywordId}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
