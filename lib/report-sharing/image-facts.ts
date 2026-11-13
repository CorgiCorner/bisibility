import type { ChallengeReportBody } from "@/lib/challenge-report/schema";
import { CHALLENGE_TILE_IDS, type ChallengeTileId } from "@/lib/challenge-report/tile-state";
import { formatPublicNumber } from "./format";
import type { PublicReport } from "./projection";

export type ShareImageFact = { label: ChallengeTileId; value: string };

export type ShareImageCopy = {
  comparison?: { start: string; latest: string; delta: number };
  facts: ShareImageFact[];
  headline: string;
  headlineTile: ChallengeTileId | null;
  clickTrend?: (number | null)[];
};

type OkTile = Extract<ChallengeReportBody["tiles"][ChallengeTileId], { state: "ok" }>;

function factValue(id: ChallengeTileId, tile: OkTile, format: (value: number) => string): string {
  switch (id) {
    case "activeDays":
      return "activeCount" in tile ? format(tile.activeCount) : "";
    case "aiAnswers":
      return "named" in tile ? `${format(tile.named)} / ${format(tile.total)}` : "";
    case "clicks":
    case "conversions":
      return "current" in tile ? format(tile.current) : "";
    case "cost":
      return "totalMinor" in tile && tile.totalMinor !== null
        ? `${tile.currency ?? ""} ${format(Math.round(tile.totalMinor / 100))}`.trim()
        : "";
    case "existingVsNew":
      return "newPages" in tile ? format(tile.newPages) : "";
    case "top10":
      if (!("endCount" in tile)) return "";
      return hasRankBaseline(tile)
        ? `${format(tile.startCount)} → ${format(tile.endCount)}`
        : format(tile.endCount);
    case "topPages":
      return "pages" in tile ? format(tile.pages.length) : "";
  }
}

function hasRankBaseline(tile: { startCount: number; hasStart?: boolean }) {
  return tile.hasStart ?? tile.startCount > 0;
}

function okTile(view: PublicReport, id: ChallengeTileId): OkTile | null {
  const tile = view.tiles[id];
  return tile?.state === "ok" ? tile : null;
}

export function shareImageCopy(view: PublicReport, locale = "en"): ShareImageCopy {
  const format = (value: number) => formatPublicNumber(value, view.roundNumbers, locale);
  const clicks = view.tiles.clicks;
  const hasClicks =
    clicks?.state === "ok" && clicks.currentSeries.some((point) => point.clicks !== null);
  const rankings = view.tiles.top10;
  const headlineTile: ChallengeTileId | null =
    view.journey && okTile(view, "activeDays")
      ? "activeDays"
      : hasClicks
        ? "clicks"
        : rankings?.state === "ok"
          ? "top10"
          : (CHALLENGE_TILE_IDS.find((id) => id !== "clicks" && okTile(view, id)) ?? null);
  const tile = headlineTile ? okTile(view, headlineTile) : null;
  const headline =
    headlineTile === "top10" && rankings?.state === "ok"
      ? format(rankings.endCount)
      : headlineTile && tile
        ? factValue(headlineTile, tile, format)
        : "";
  const comparison =
    headlineTile === "top10" && rankings?.state === "ok" && hasRankBaseline(rankings)
      ? {
          start: format(rankings.startCount),
          latest: format(rankings.endCount),
          delta: rankings.endCount - rankings.startCount,
        }
      : undefined;
  const clickTrend =
    headlineTile === "clicks" && clicks?.state === "ok"
      ? clicks.currentSeries.map((point) => point.clicks)
      : undefined;
  const facts: ShareImageFact[] = [];
  for (const id of CHALLENGE_TILE_IDS) {
    if (facts.length === 3 || id === headlineTile) continue;
    if (id === "clicks" && !hasClicks) continue;
    const fact = okTile(view, id);
    if (!fact) continue;
    const value = factValue(id, fact, format);
    if (value) facts.push({ label: id, value });
  }
  return { comparison, facts, headline, headlineTile, clickTrend };
}
