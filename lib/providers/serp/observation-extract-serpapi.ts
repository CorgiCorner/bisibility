import type {
  ObservationCompleteness,
  ObservationItemInput,
  ObservationRequestPolicy,
  ObservationRunInput,
  ObservationScope,
} from "@/lib/observation/types";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringValue(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    return null;
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function websiteDomain(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function firstTextBlockTitle(values: readonly unknown[]) {
  for (const value of values) {
    const block = record(value);
    const title = block ? (text(block.snippet) ?? text(block.title)) : null;
    if (title) return title;
  }
  return null;
}

function localPackItem(item: RecordValue, index: number): ObservationItemInput {
  const links = record(item.links);
  const url = text(links?.website) ?? text(item.website);
  const value = finite(item.rating);
  const count = finite(item.reviews);
  return {
    blockPosition: null,
    businessName: text(item.title),
    cid: stringValue(item.data_cid),
    domain: websiteDomain(url),
    mapsUrl: text(links?.directions),
    placeId: stringValue(item.place_id),
    positionInBlock: index + 1,
    rankAbsolute: null,
    rankGroup: null,
    rating: value === null && count === null ? null : { count, value },
    rawFragment: item,
    resultKind: "local_pack",
    title: text(item.title),
    url,
  };
}

function aiOverviewItem(item: RecordValue): ObservationItemInput {
  const textBlocks = Array.isArray(item.text_blocks) ? item.text_blocks : [];
  return {
    blockPosition: null,
    businessName: null,
    cid: null,
    domain: null,
    mapsUrl: null,
    placeId: null,
    positionInBlock: 1,
    rankAbsolute: null,
    rankGroup: null,
    rating: null,
    rawFragment: item,
    resultKind: "ai_overview",
    title: firstTextBlockTitle(textBlocks),
    url: null,
  };
}

function localResultBlocks(page: RecordValue) {
  const local = page.local_results;
  const fromLocal = Array.isArray(local) ? local : record(local)?.places;
  const fromPlaces = page.places_results;
  return [
    ...(Array.isArray(fromLocal) ? [fromLocal] : []),
    ...(Array.isArray(fromPlaces) ? [fromPlaces] : []),
  ];
}

export function serpApiObservationRun(input: {
  pages: readonly unknown[];
  requestPolicy: ObservationRequestPolicy;
  completeness: ObservationCompleteness;
  configuredScope: ObservationScope;
  effectiveScope?: ObservationScope | null;
  executedAt: Date;
}): ObservationRunInput {
  const items: ObservationItemInput[] = [];

  for (const value of input.pages) {
    const page = record(value);
    if (!page) continue;
    for (const block of localResultBlocks(page)) {
      const placeIds = new Set<string>();
      let placeIndex = 0;
      for (const placeValue of block) {
        const place = record(placeValue);
        if (!place) continue;
        const placeId = stringValue(place.place_id);
        if (placeId && placeIds.has(placeId)) continue;
        if (placeId) placeIds.add(placeId);
        items.push(localPackItem(place, placeIndex));
        placeIndex += 1;
      }
    }

    const aiOverview = record(page.ai_overview);
    if (aiOverview) items.push(aiOverviewItem(aiOverview));
  }

  // Built field by field: spreading `input` would carry whole SERP pages into the run.
  return {
    completeness: input.completeness,
    configuredScope: input.configuredScope,
    effectiveScope: input.effectiveScope ?? null,
    engine: "google",
    executedAt: input.executedAt,
    items,
    provider: "serpapi",
    requestPolicy: input.requestPolicy,
    surface: "web_serp",
  };
}
