import { providerObservationTime } from "@/lib/observation/provider-metadata";
import type { ObservationItemInput } from "@/lib/observation/types";
import {
  identifier,
  nonempty,
  object,
  type PackExtraction,
  positiveOrdinal,
} from "./web-local-proof";

/** Current advanced payload: flat local_pack rows. Nested legacy containers remain readable. */
export function dataForSeoLocalPack(
  items: readonly unknown[],
  results: readonly unknown[],
): PackExtraction & { bySourceIndex: Map<number, ObservationItemInput[]> } {
  const resultByItem = new Map<unknown, { time: string | null; index: number }>();
  results.forEach((value, index) => {
    const result = object(value);
    const values = result?.items;
    for (const item of Array.isArray(values) ? values : []) {
      resultByItem.set(item, { time: providerObservationTime(result?.datetime), index });
    }
  });
  const output: ObservationItemInput[] = [];
  const bySourceIndex = new Map<number, ObservationItemInput[]>();
  let identityIssues = 0,
    blockStart = -1,
    previousPage: number | null = null,
    previousRank: number | null = null;
  for (const [index, value] of items.entries()) {
    const row = object(value);
    if (row?.type !== "local_pack") {
      blockStart = -1;
      continue;
    }
    const origin = resultByItem.get(value);
    const page = positiveOrdinal(row.page);
    const nested = Array.isArray(row.items);
    const rank = positiveOrdinal(row.rank_group);
    if (
      nested ||
      blockStart < 0 ||
      page !== previousPage ||
      (rank !== null && previousRank !== null && rank <= previousRank)
    )
      blockStart = index;
    const blockId = `dataforseo:result:${origin?.index ?? "unknown"}:page:${page ?? "unknown"}:local:${blockStart}`;
    const children = nested ? (row.items as unknown[]) : [row];
    for (const [childIndex, childValue] of children.entries()) {
      const child = object(childValue);
      if (!child) continue;
      const cid = identifier(child.cid),
        place = identifier(child.place_id);
      identityIssues += Number(cid.invalid || place.invalid);
      const rating = object(child.rating);
      const number = (value: unknown) =>
        typeof value === "number" && Number.isFinite(value) ? value : null;
      const extracted: ObservationItemInput = {
        resultKind: "local_pack",
        rankScale: "pack_slot",
        promotion:
          child.is_paid === false ? "organic" : child.is_paid === true ? "promoted" : "unknown",
        sourcePage: positiveOrdinal(child.page) ?? page,
        sourceBlockId: blockId,
        sourceOrdinal: nested ? childIndex : index,
        observedAt: origin?.time ? new Date(origin.time) : null,
        blockPosition: positiveOrdinal(row.rank_absolute),
        positionInBlock: positiveOrdinal(child.rank_group),
        rankAbsolute: positiveOrdinal(child.rank_absolute),
        rankGroup: positiveOrdinal(child.rank_group),
        businessName: nonempty(child.title),
        title: nonempty(child.title),
        domain: nonempty(child.domain),
        cid: cid.value,
        placeId: place.value,
        url: nonempty(child.url),
        mapsUrl: nonempty(child.url_maps) ?? nonempty(child.maps_url) ?? nonempty(child.directions),
        rating: rating ? { count: number(rating.votes_count), value: number(rating.value) } : null,
        rawFragment: childValue,
      };
      output.push(extracted);
      bySourceIndex.set(index, [...(bySourceIndex.get(index) ?? []), extracted]);
    }
    previousPage = page;
    previousRank = rank;
    if (nested) blockStart = -1;
  }
  return { items: output, identityIssues, bySourceIndex };
}
