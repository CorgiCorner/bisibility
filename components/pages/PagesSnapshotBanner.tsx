"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ActivePageSnapshot } from "@/lib/pages/snapshot-view";
import { appPath } from "@/lib/routing/app-path";
import { useFormatter, useTranslations } from "next-intl";

export function PagesSnapshotBanner({
  projectId,
  snapshot,
}: Readonly<{ projectId: string; snapshot: ActivePageSnapshot }>) {
  const t = useTranslations("projectPages");
  const format = useFormatter();
  const date = format.dateTime(new Date(`${snapshot.takenOn}T12:00:00.000Z`), {
    dateStyle: "medium",
  });
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0 font-semibold text-fg">
            {t("snapshot.bannerTitle", { date, label: snapshot.label })}
          </p>
          <p className="m-0 text-ui-caption text-fg-muted">
            {t("snapshot.bannerCount", { count: snapshot.pageCount })}
          </p>
          <p className="m-0 max-w-3xl text-ui-caption text-fg-muted">
            {snapshot.source === "registry"
              ? t("snapshot.bannerRegistry")
              : t("snapshot.bannerSitemap")}
          </p>
        </div>
        <Button
          className="whitespace-nowrap"
          href={appPath(projectId, "annotations")}
          size="sm"
          variant="secondary"
        >
          {t("snapshot.openAnnotations")}
        </Button>
      </div>
    </Card>
  );
}
