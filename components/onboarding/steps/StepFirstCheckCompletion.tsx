import { appPath } from "@/lib/routing/app-path";
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
  const rankTrackerHref = appPath(projectId, "rank-tracker");
  const settingsHref = appPath(projectId, "settings", "tracking");
  const singular = keywordCount === 1;
  const keywordsLabel = `${keywordCount} ${singular ? "keyword" : "keywords"}`;
  const be = singular ? "is" : "are";
  const run = singular ? "runs" : "run";
  const objectPronoun = singular ? "it" : "them";
  if (frequency === "manual")
    return (
      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
        Your {keywordsLabel} {be} ready. Nothing runs - or spends - until you say so: run{" "}
        {objectPronoun}
        anytime from the{" "}
        <a className="underline" href={rankTrackerHref}>
          Rank Tracker
        </a>
        , or switch to a schedule in{" "}
        <a className="underline" href={settingsHref}>
          settings
        </a>{" "}
        for hands-off tracking.
      </p>
    );
  if (frequency === "paused")
    return (
      <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
        Your {keywordsLabel} {be} paused. No scheduled checks run until you resume tracking in{" "}
        <a className="underline" href={settingsHref}>
          settings
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
    nextRun = nextCheckAt
      ? new Intl.DateTimeFormat("en", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: timezone,
        }).format(new Date(nextCheckAt))
      : null;
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
