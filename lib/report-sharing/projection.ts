import type { ChallengeReportBody } from "@/lib/challenge-report/schema";
import { CHALLENGE_TILE_IDS, type ChallengeTileId } from "@/lib/challenge-report/tile-state";
import { formatPublicNumber } from "./format";
import { defaultShareSettings, orderedVisibleTiles, type ShareSettings } from "./settings";

export type PublicReport = {
  display: { clicks: string | null };
  journey?: ChallengeReportBody["journey"];
  lessons: ChallengeReportBody["lessons"] | null;
  noindex: boolean;
  period: ChallengeReportBody["period"];
  roundNumbers: boolean;
  showBadge: boolean;
  sources: ChallengeReportBody["sources"];
  stage: ChallengeReportBody["stage"];
  tiles: Partial<ChallengeReportBody["tiles"]>;
};

export function publicReportView(
  body: ChallengeReportBody,
  settings: ShareSettings,
  locale = "en",
): PublicReport {
  const visible = new Set(orderedVisibleTiles(settings.visibleTiles));
  const tiles = {} as PublicReport["tiles"];
  const writable = tiles as Record<ChallengeTileId, ChallengeReportBody["tiles"][ChallengeTileId]>;
  for (const id of visible) {
    const tile = body.tiles[id];
    if (tile && !(tile.state !== "ok" && tile.reason === "activity_hidden"))
      writable[id] = structuredClone(tile);
  }
  const clicks = tiles.clicks;
  return {
    ...(body.journey && tiles.activeDays?.state === "ok" ? { journey: { ...body.journey } } : {}),
    display: {
      clicks:
        clicks?.state === "ok"
          ? formatPublicNumber(clicks.current, settings.roundNumbers, locale)
          : null,
    },
    lessons: settings.showLessons ? structuredClone(body.lessons) : null,
    noindex: settings.noindex,
    period: { ...body.period },
    roundNumbers: settings.roundNumbers,
    showBadge: settings.showBadge,
    sources: [...body.sources],
    stage: body.stage,
    tiles,
  };
}

export function hiddenTileIds(settings: ShareSettings): ChallengeTileId[] {
  const visible = new Set<ChallengeTileId>(settings.visibleTiles);
  return CHALLENGE_TILE_IDS.filter((id) => !visible.has(id));
}

export function privateReportCardView(body: ChallengeReportBody, selected?: readonly string[]) {
  const settings = defaultShareSettings();
  const visibleTiles = selected
    ? CHALLENGE_TILE_IDS.filter((id) => selected.includes(id))
    : body.journey
      ? ["activeDays" as const, ...settings.visibleTiles]
      : settings.visibleTiles;
  return publicReportView(body, { ...settings, visibleTiles, showLessons: false });
}
