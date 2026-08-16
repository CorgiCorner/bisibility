import { appPath } from "@/lib/routing/app-path";

const RANK_TRACKER_ACTIONS = ["add", "import", "export", "filter"] as const;

export type RankTrackerAction = (typeof RANK_TRACKER_ACTIONS)[number];

export function parseRankTrackerAction(value: string | null | undefined): RankTrackerAction | null {
  return RANK_TRACKER_ACTIONS.includes(value as RankTrackerAction)
    ? (value as RankTrackerAction)
    : null;
}

export function rankTrackerActionHref(projectRef: string, action: RankTrackerAction): string {
  return `${appPath(projectRef, "rank-tracker")}?action=${action}`;
}
