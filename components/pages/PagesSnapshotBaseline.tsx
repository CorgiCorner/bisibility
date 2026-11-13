"use client";

import { Button } from "@/components/ui/Button";
import type { ActivePageSnapshot } from "@/lib/pages/snapshot-view";
import { appPath } from "@/lib/routing/app-path";
import { useFormatter, useTranslations } from "next-intl";

/** The comparison baseline date and the report shortcut since that snapshot. */
export function PagesSnapshotBaseline({
  projectId,
  snapshot,
}: Readonly<{ projectId: string; snapshot: ActivePageSnapshot }>) {
  const t = useTranslations("projectPages.snapshot");
  const format = useFormatter();
  const date = format.dateTime(new Date(`${snapshot.takenOn}T12:00:00.000Z`), {
    dateStyle: "medium",
  });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-ui-caption text-fg-muted">{t("dateLabel", { date })}</span>
      <Button
        href={`${appPath(projectId, "agent-reports")}?compose=performance&from=${snapshot.takenOn}`}
        size="sm"
        variant="ghost"
      >
        {t("results")}
      </Button>
    </div>
  );
}
