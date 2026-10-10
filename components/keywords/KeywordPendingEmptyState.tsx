import type { KeywordCheckState } from "@/lib/queries/keyword-row";
import { appPath } from "@/lib/routing/app-path";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import type { SerpDepth } from "@/lib/serp/constants";
export type EmptyRankCopy = {
  action: "check_top" | "connect_provider" | "refresh" | "retry" | "run_first_check";
  depth: SerpDepth;
  href: string;
};

export function emptyRankCopy(
  state: Exclude<KeywordCheckState, "ranked">,
  projectRef: string,
  trackedDepth: SerpDepth = 100,
  providerConnected = true,
): EmptyRankCopy {
  if (state === "running") {
    return {
      action: "refresh",
      depth: trackedDepth,
      href: projectRunsPath(projectRef),
    };
  }
  if (state === "failed" || state === "unknown") {
    return {
      action: "retry",
      depth: trackedDepth,
      href: projectRunsPath(projectRef),
    };
  }
  if (state === "not_ranked") {
    return {
      action: "check_top",
      depth: trackedDepth,
      href: projectRunsPath(projectRef),
    };
  }
  return {
    action: providerConnected ? "run_first_check" : "connect_provider",
    depth: trackedDepth,
    href: appPath(projectRef, "integrations"),
  };
}
