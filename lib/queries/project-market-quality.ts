import { determinate } from "@/lib/rank-measurements/qualify";
import type { RankTrackerCurrentTarget } from "./rank-tracker-report-model";

/** Original unweighted Top3 / full active-keyword cohort; unproved current facts do not become zero. */
export function legacyMarketTopThree(
  ids: readonly string[],
  resolutions: readonly RankTrackerCurrentTarget[],
) {
  const byId = new Map(resolutions.map((target) => [target.id, target.resolution.current]));
  const checks = ids.map((id) => byId.get(id));
  const complete =
    checks.length > 0 &&
    checks.every((check) => determinate(check) && check?.freshness === "fresh");
  const topThreeCount = complete
    ? checks.filter(
        (check) => check?.evidence === "positive" && check.position !== null && check.position <= 3,
      ).length
    : null;
  return {
    topThreeCount,
    currentVisibility:
      topThreeCount === null ? null : Number(((topThreeCount / ids.length) * 100).toFixed(1)),
  };
}
