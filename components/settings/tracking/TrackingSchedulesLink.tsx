"use client";

import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function TrackingSchedulesLink({ projectId }: Readonly<{ projectId: string }>) {
  const t = useTranslations("projectSettingsTracking.schedules");
  return (
    <p className="m-0 max-w-[760px] text-[13px] leading-5 text-fg-muted">
      {t("description")}{" "}
      <Link
        className="text-accent-foreground underline underline-offset-4"
        href={projectSchedulesPath(projectId)}
      >
        {t("manage")}
      </Link>
    </p>
  );
}
