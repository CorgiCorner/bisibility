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

function rating(item: RecordValue) {
  const value = record(item.rating);
  return value ? { count: finite(value.votes_count), value: finite(value.value) } : null;
}

function firstChildTitle(values: readonly unknown[]) {
  for (const value of values) {
    const child = record(value);
    const title = child ? (text(child.title) ?? text(child.text)) : null;
    if (title) return title;
  }
  return null;
}

function localPackItem(
  item: RecordValue,
  positionInBlock: number,
  position: number | null,
): ObservationItemInput {
  return {
    blockPosition: position,
    businessName: text(item.title),
    cid: stringValue(item.cid),
    domain: text(item.domain),
    mapsUrl: text(item.url_maps) ?? text(item.maps_url) ?? text(item.directions) ?? null,
    placeId: stringValue(item.place_id),
    positionInBlock,
    rankAbsolute: finite(item.rank_absolute),
    rankGroup: finite(item.rank_group),
    rating: rating(item),
    rawFragment: item,
    resultKind: "local_pack",
    title: text(item.title),
    url: text(item.url),
  };
}

function aiOverviewItem(item: RecordValue, position: number | null): ObservationItemInput {
  const children = Array.isArray(item.items) ? item.items : [];
  return {
    blockPosition: position,
    businessName: null,
    cid: null,
    domain: null,
    mapsUrl: null,
    placeId: null,
    positionInBlock: 1,
    rankAbsolute: finite(item.rank_absolute),
    rankGroup: finite(item.rank_group),
    rating: null,
    rawFragment: item,
    resultKind: "ai_overview",
    title: text(item.title) ?? firstChildTitle(children),
    url: null,
  };
}

export function dataForSeoObservationRun(input: {
  items: readonly unknown[];
  requestPolicy: ObservationRequestPolicy;
  completeness: ObservationCompleteness;
  configuredScope: ObservationScope;
  effectiveScope?: ObservationScope | null;
  executedAt: Date;
}): ObservationRunInput {
  const items: ObservationItemInput[] = [];

  for (let index = 0; index < input.items.length; index += 1) {
    const item = record(input.items[index]);
    if (!item || typeof item.type !== "string") continue;

    if (item.type === "organic") continue;

    if (item.type === "local_pack") {
      if (Array.isArray(item.items)) {
        const firstChild = record(item.items[0]);
        const position = finite(item.rank_absolute) ?? finite(firstChild?.rank_absolute);
        for (const [childIndex, value] of item.items.entries()) {
          const child = record(value);
          if (child) {
            items.push(localPackItem(child, finite(child.rank_group) ?? childIndex + 1, position));
          }
        }
        continue;
      }

      const position = finite(item.rank_absolute);
      let indexInBlock = 0;
      for (; index < input.items.length; index += 1) {
        const sibling = record(input.items[index]);
        if (sibling?.type !== "local_pack" || Array.isArray(sibling.items)) break;
        items.push(
          localPackItem(sibling, finite(sibling.rank_group) ?? indexInBlock + 1, position),
        );
        indexInBlock += 1;
      }
      index -= 1;
      continue;
    }

    if (item.type === "ai_overview") {
      items.push(aiOverviewItem(item, finite(item.rank_absolute)));
    }
  }

  // Built field by field: spreading `input` would carry the raw provider items into the run.
  return {
    completeness: input.completeness,
    configuredScope: input.configuredScope,
    effectiveScope: input.effectiveScope ?? null,
    engine: "google",
    executedAt: input.executedAt,
    items,
    provider: "dataforseo",
    requestPolicy: input.requestPolicy,
    surface: "web_serp",
  };
}
