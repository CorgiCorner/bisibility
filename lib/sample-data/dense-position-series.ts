// Turns the four weekly anchor positions of a demo keyword into a dense daily
// series so the overview trend chart reads like a real rank history (wobble, the
// occasional flat day or small regression) instead of a straight rising line.
// Jitter is driven by a keyword-seeded LCG (never Math.random), so reseeding the
// demo database is stable and the series always ends on the keyword's final
// anchor position - keeping the KPI cards coherent.

// Daily checks emitted per keyword, matching DENSE_CHECK_COUNT dates in fixtures.
export const DENSE_CHECK_COUNT = 22;

function lcgFromSeed(seed: string): () => number {
  let state = 0;
  for (const char of seed) {
    state = (Math.imul(state, 31) + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  state = state || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function jitter(random: () => number): number {
  const magnitudeRoll = random();
  let magnitude = 0;
  if (magnitudeRoll > 0.85) magnitude = 2;
  else if (magnitudeRoll > 0.55) magnitude = 1;
  if (magnitude === 0) return 0;
  return random() < 0.5 ? -magnitude : magnitude;
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio;
}

// Even anchor slots across the dense series (e.g. 4 anchors -> indices 0,7,14,21).
function anchorIndexAt(anchor: number, anchorCount: number, count: number): number {
  return Math.round((anchor * (count - 1)) / (anchorCount - 1));
}

export function densePositionSeries(
  anchors: readonly number[],
  publicId: string,
  count: number = DENSE_CHECK_COUNT,
): number[] {
  if (anchors.length === 0) return [];
  if (anchors.length === 1) return Array.from({ length: count }, () => Math.max(1, anchors[0]));

  const random = lcgFromSeed(publicId);
  const anchorIndices = anchors.map((_, anchor) => anchorIndexAt(anchor, anchors.length, count));

  const series: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const anchorSlot = anchorIndices.indexOf(index);
    if (anchorSlot !== -1) {
      // Pin every anchor exactly so the trend and final KPI stay truthful.
      series.push(Math.max(1, Math.round(anchors[anchorSlot])));
      continue;
    }
    let segment = 0;
    while (segment < anchors.length - 2 && anchorIndices[segment + 1] <= index) segment += 1;
    const low = anchorIndices[segment];
    const high = anchorIndices[segment + 1];
    const ratio = (index - low) / (high - low);
    const base = lerp(anchors[segment], anchors[segment + 1], ratio);
    series.push(Math.max(1, Math.round(base + jitter(random))));
  }
  return series;
}
