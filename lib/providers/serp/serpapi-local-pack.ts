import { providerObservationTime } from "@/lib/observation/provider-metadata";
import type { ObservationItemInput } from "@/lib/observation/types";
import {
  identifier,
  nonempty,
  object,
  type PackExtraction,
  positiveOrdinal,
  type SentWebPage,
  serpApiWebPageProof,
} from "./web-local-proof";

function domain(url: string | null) {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}
/** Only the documented Google web local_results.places container has known ad semantics. */
export function serpApiLocalPack(
  pages: readonly unknown[],
  sentPages: readonly SentWebPage[] = [],
): PackExtraction {
  const items: ObservationItemInput[] = [];
  let identityIssues = 0;
  pages.forEach((value, pageIndex) => {
    const page = object(value);
    if (!page) return;
    const metadata = object(page.search_metadata),
      local = object(page.local_results);
    const sent = sentPages[pageIndex];
    const proof = serpApiWebPageProof(page, sent);
    const current = proof.valid && Array.isArray(local?.places);
    const pageNumber = current ? proof.page : null;
    const time = providerObservationTime(metadata?.processed_at);
    const blocks = [
      { key: "local_results.places", rows: local?.places, documented: current },
      { key: "local_results", rows: page.local_results, documented: false },
      { key: "places_results", rows: page.places_results, documented: false },
    ];
    for (const block of blocks) {
      if (!Array.isArray(block.rows)) continue;
      for (const [index, raw] of block.rows.entries()) {
        const row = object(raw);
        if (!row) continue;
        const links = object(row.links),
          url = nonempty(links?.website) ?? nonempty(row.website);
        // Google web's place_id is the ludocid/CID, unlike Maps' distinct Place ID.
        const webCid = block.documented
          ? identifier(row.place_id)
          : { value: null, invalid: false };
        const explicitCid = identifier(row.data_cid);
        const legacyPlace = block.documented
          ? { value: null, invalid: false }
          : identifier(row.place_id);
        const conflict =
          explicitCid.value !== null && webCid.value !== null && explicitCid.value !== webCid.value;
        identityIssues += Number(
          webCid.invalid || explicitCid.invalid || legacyPlace.invalid || conflict,
        );
        const number = (value: unknown) =>
          typeof value === "number" && Number.isFinite(value) ? value : null;
        const rating = number(row.rating),
          count = number(row.reviews);
        items.push({
          resultKind: "local_pack",
          rankScale: block.documented ? "pack_slot" : null,
          promotion: !block.documented
            ? "unknown"
            : row.ad === true
              ? "promoted"
              : row.ad === undefined || row.ad === false
                ? "organic"
                : "unknown",
          sourcePage: pageNumber,
          sourceBlockId: `serpapi:response:${pageIndex}:${block.key}`,
          sourceOrdinal: index,
          observedAt: time ? new Date(time) : null,
          blockPosition: null,
          positionInBlock: positiveOrdinal(row.position),
          rankGroup: null,
          rankAbsolute: null,
          businessName: nonempty(row.title),
          title: nonempty(row.title),
          domain: domain(url),
          url,
          cid: explicitCid.value ?? webCid.value,
          placeId: legacyPlace.value,
          mapsUrl: nonempty(links?.directions),
          rating: rating === null && count === null ? null : { count, value: rating },
          rawFragment: raw,
        });
      }
    }
  });
  return { items, identityIssues };
}
