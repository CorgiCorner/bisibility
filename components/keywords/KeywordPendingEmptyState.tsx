import type { KeywordCheckState } from "@/lib/queries/keyword-row";
import { appPath, rankTrackerTabPath } from "@/lib/routing/app-path";
import type { SerpDepth } from "@/lib/serp/markets";
import { notRankedLabel } from "@/lib/serp/rank-depth";

export type EmptyRankCopy = {
  badge: string;
  body: string;
  href: string;
  link: string | ((depth: SerpDepth) => string);
  position: string;
  title: string;
};

export function checkTopDepthLabel(depth: SerpDepth): string {
  return `Check top ${depth}`;
}

export function emptyRankCopy(
  state: Exclude<KeywordCheckState, "ranked">,
  projectRef: string,
  trackedDepth = 100,
  providerConnected = true,
): EmptyRankCopy {
  if (state === "running") {
    return {
      badge: "No data",
      body: "The provider is fetching results for this keyword. The page updates as soon as the check completes.",
      href: rankTrackerTabPath(projectRef, "checks"),
      link: "Refresh",
      position: "No data",
      title: "Rank check in progress",
    };
  }
  if (state === "failed") {
    return {
      badge: "No data",
      body: "The last check returned an error.",
      href: rankTrackerTabPath(projectRef, "checks"),
      link: "Retry check",
      position: "No data",
      title: "No position from the latest check",
    };
  }
  if (state === "not_ranked") {
    return {
      badge: notRankedLabel(trackedDepth),
      body: "Outside the tracked depth on the last check.",
      href: rankTrackerTabPath(projectRef, "checks"),
      link: checkTopDepthLabel,
      position: `outside top ${trackedDepth}`,
      title: `Not ranked in the top ${trackedDepth}`,
    };
  }
  return {
    badge: "No data",
    body: providerConnected
      ? "First check has not run yet."
      : "First check has not run yet. Connect a SERP provider to run it.",
    href: appPath(projectRef, "integrations"),
    link: providerConnected ? "Run first check" : "Connect a SERP provider",
    position: "No data",
    title: "No ranking data yet",
  };
}
