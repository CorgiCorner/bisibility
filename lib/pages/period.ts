import { WINDOW_PRESETS } from "@/lib/search-insights/constants";
import type { FinalizedWindow } from "@/lib/search-insights/dates";
import { addDays, dateFromKey, finalizedWindow, pacificToday } from "@/lib/search-insights/dates";
import {
  resolvePeriod,
  type SearchInsightsPeriod,
} from "@/lib/search-insights/queries/context-model";

/** Pages uses the same presets as Search Console. The default view is the 28-day preset. */
export const PROJECT_PAGES_PERIODS = ["7", "28", "90"] as const;
export type ProjectPagesPeriodId = (typeof PROJECT_PAGES_PERIODS)[number];
export const DEFAULT_PROJECT_PAGES_PERIOD: ProjectPagesPeriodId = "28";

const PERIOD_LAG_DAYS = 1;

export type ProjectPagesPeriod = {
  from: Date;
  period: SearchInsightsPeriod;
  to: Date;
  window: FinalizedWindow;
};

export function projectPagesPeriodId(raw: string | null | undefined): ProjectPagesPeriodId {
  return PROJECT_PAGES_PERIODS.find((id) => id === raw) ?? DEFAULT_PROJECT_PAGES_PERIOD;
}

export function projectPagesPeriod(
  raw: string | null | undefined,
  now = new Date(),
): ProjectPagesPeriod {
  const id = projectPagesPeriodId(raw);
  const period = resolvePeriod(id);
  const preset = WINDOW_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error("Pages period preset is missing.");
  const end = addDays(pacificToday(now), -PERIOD_LAG_DAYS);
  const window = finalizedWindow(end, period.days);
  return {
    from: dateFromKey(window.current.start),
    period,
    to: dateFromKey(window.current.end),
    window,
  };
}
