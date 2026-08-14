import { keywordMarketLabel } from "@/lib/keywords/market-position-history";
import type { KeywordRow, PositionPoint } from "@/lib/queries/keywords";
import { chartColors } from "@/lib/theme/chart-colors";

export const marketPositionPalette = [
  chartColors.accent,
  chartColors.blue,
  chartColors.green,
  chartColors.yellow,
  chartColors.orange,
  chartColors.red,
];

export function PositionHistoryMarketLegend({
  allMarkets,
  comparisonPoints,
  history,
  markets,
  visibleMarkets,
}: Readonly<{
  allMarkets: boolean;
  comparisonPoints: readonly (readonly PositionPoint[])[];
  history: readonly PositionPoint[];
  markets: readonly KeywordRow[];
  visibleMarkets: readonly KeywordRow[];
}>) {
  const degraded = (allMarkets ? comparisonPoints.flat() : history).some(
    (point) => point.degradedToCountry,
  );
  return (
    <>
      {degraded ? (
        <p className="m-0 mt-2 inline-flex items-center gap-2 text-[11px] text-fg-muted">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-fg-muted bg-bg-elev"
          />
          checked at country level
        </p>
      ) : null}
      {allMarkets ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Compared markets">
          {visibleMarkets.map((target, index) => (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-sunken px-2.5 py-1 font-mono text-[10.5px] text-fg-muted"
              key={target.id}
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: marketPositionPalette[index % marketPositionPalette.length],
                }}
              />
              {keywordMarketLabel(target)} {target.hasRankData ? `#${target.position}` : "n/a"}
              {target.volumeKnown === false || target.difficultyKnown === false
                ? " / no volume/KD"
                : ""}
            </span>
          ))}
          {markets.length > 6 ? (
            <span className="font-mono text-[10.5px] text-fg-muted">
              +{markets.length - 6} more markets - filter in the grid to compare them
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
