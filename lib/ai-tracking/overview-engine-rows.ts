import type { OverviewEngineRow } from "@/lib/ai-tracking/overview-model";

/** Enabled engines missing from the answer tally stay visible as empty rows. */
export function overviewEnginesIncludingEnabled(
  rows: readonly OverviewEngineRow[],
  enabled: readonly string[],
): OverviewEngineRow[] {
  const present = new Set(rows.map((row) => row.engine));
  const extra = enabled
    .filter((engine) => !present.has(engine))
    .map(
      (engine): OverviewEngineRow => ({
        answers: 0,
        cited: 0,
        engine,
        named: 0,
        providers: [],
        quiet: true,
      }),
    );
  return [...rows, ...extra];
}
