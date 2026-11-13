import { CHALLENGE_TILE_IDS, type ChallengeTileId } from "./tile-state";

const QUARTERS = new Set<ChallengeTileId>(["aiAnswers", "conversions", "existingVsNew", "top10"]);

export type BentoSpan = {
  id: ChallengeTileId;
  lg: 3 | 4 | 6 | 8 | 12;
  md: 1 | 2;
};

/** Desktop and tablet spans that pack the visible tiles into full rows. */
export function challengeBentoLayout(present: readonly ChallengeTileId[]): BentoSpan[] {
  const ids = CHALLENGE_TILE_IDS.filter((id) => present.includes(id));
  const has = new Set(ids);
  const quarterCount = ids.filter((id) => QUARTERS.has(id)).length;
  const quarter = quarterSpan(quarterCount);
  const placed: BentoSpan[] = [];
  let remaining = 2;
  for (const id of ids) {
    const md = tabletSpan(id, has);
    if (md > remaining) {
      const previous = placed.at(-1);
      if (previous && previous.md === 1 && remaining === 1) previous.md = 2;
      remaining = 2;
    }
    placed.push({ id, lg: desktopSpan(id, has, quarter), md });
    remaining -= md;
    if (remaining === 0) remaining = 2;
  }
  const last = placed.at(-1);
  if (last && remaining === 1 && last.md === 1) last.md = 2;
  return placed;
}

function quarterSpan(count: number): 3 | 4 | 6 | 12 {
  if (count >= 4) return 3;
  if (count === 3) return 4;
  if (count === 2) return 6;
  return 12;
}

function desktopSpan(
  id: ChallengeTileId,
  present: ReadonlySet<ChallengeTileId>,
  quarter: 3 | 4 | 6 | 12,
): BentoSpan["lg"] {
  if (id === "clicks") return present.has("activeDays") ? 8 : 12;
  if (id === "activeDays") return present.has("clicks") ? 4 : 12;
  if (id === "topPages") return present.has("cost") ? 8 : 12;
  if (id === "cost") return present.has("topPages") ? 4 : 12;
  return quarter;
}

function tabletSpan(id: ChallengeTileId, present: ReadonlySet<ChallengeTileId>): 1 | 2 {
  if (id === "clicks") return present.has("activeDays") ? 1 : 2;
  if (id === "topPages") return present.has("cost") ? 1 : 2;
  return 1;
}
