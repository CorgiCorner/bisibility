"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { formatDateTime } from "@/lib/dates/format";
import { appPath } from "@/lib/routing/app-path";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import type { ProjectDefaultsInput } from "@/lib/schemas/project";

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
  const dateFormat = useDateFormat();
  const rankTrackerHref = appPath(projectId, "rank-tracker");
  const settingsHref = projectSchedulesPath(projectId);
  const singular = keywordCount === 1;
  const keywordsLabel = `${keywordCount} ${singular ? "keyword" : "keywords"}`;
  const be = singular ? "is" : "are";
  const run = singular ? "runs" : "run";
  const objectPronoun = singular ? "it" : "them";
  if (frequency === "manual")
    return (
      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
        Your {keywordsLabel} {be} ready. Nothing runs - or spends - until you say so: run{" "}
        {objectPronoun} anytime from the{" "}
        <a className="underline" href={rankTrackerHref}>
          Rank Tracker
        </a>
        , or switch to a schedule in{" "}
        <a className="underline" href={settingsHref}>
          Schedules
        </a>{" "}
        for hands-off tracking.
      </p>
    );
  if (frequency === "paused")
    return (
      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
        Your {keywordsLabel} {be} paused. No scheduled checks run until you resume tracking in{" "}
        <a className="underline" href={settingsHref}>
          Schedules
        </a>
        . You can still run {objectPronoun} from the{" "}
        <a className="underline" href={rankTrackerHref}>
          Rank Tracker
        </a>
        .
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
      Your {keywordsLabel} {run} automatically on your {frequencyLabel.toLowerCase()} schedule
      {nextRun ? ` - next run ${nextRun}` : ""}. Or run {objectPronoun} anytime from the{" "}
      <a className="underline" href={rankTrackerHref}>
        Rank Tracker
      </a>
      .
    </p>
  );
}
