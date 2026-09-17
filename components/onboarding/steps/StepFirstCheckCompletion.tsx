"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { formatDateTime } from "@/lib/dates/format";
import { appPath } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type Props = {
  frequency?: ProjectDefaultsInput["frequency"];
  frequencyLabel: string;
  keywordCount: number;
  projectId: string;
  nextCheckAt?: string | null;
  timezone: string;
};

export function StepFirstCheckCompletion({
  frequency,
  frequencyLabel,
  keywordCount,
  nextCheckAt,
  projectId,
  timezone,
}: Readonly<Props>) {
  const t = useTranslations("onboarding.firstCheck");
  const dateFormat = useDateFormat();
  const rankTrackerHref = appPath(projectId, "rank-tracker");
  const settingsHref = projectSchedulesPath(projectId);
  const objectPronoun = keywordCount === 1 ? t("completion.it") : t("completion.them");
  const links = {
    schedules: (chunks: ReactNode) => (
      <a className="underline" href={settingsHref}>
        {chunks}
      </a>
    ),
    tracker: (chunks: ReactNode) => (
      <a className="underline" href={rankTrackerHref}>
        {chunks}
      </a>
    ),
  };
  if (frequency === "manual")
    return (
      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
        {t.rich("completion.manual", { ...links, keywords: keywordCount, objectPronoun })}
      </p>
    );
  if (frequency === "paused")
    return (
      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
        {t.rich("completion.paused", { ...links, keywords: keywordCount, objectPronoun })}
      </p>
    );
  let nextRun: string | null = null;
  try {
    nextRun = nextCheckAt ? formatDateTime(new Date(nextCheckAt), dateFormat, timezone) : null;
  } catch {
    nextRun = null;
  }
  return (
    <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
      {t.rich("completion.scheduled", {
        ...links,
        frequency: frequencyLabel,
        keywords: keywordCount,
        nextRun: nextRun ?? "none",
        objectPronoun,
      })}
    </p>
  );
}
