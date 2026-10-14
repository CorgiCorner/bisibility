import {
  businessDomainCandidateKey,
  normalizeGoogleMapsUrl,
  opaqueBusinessIdentifier,
} from "@/lib/business-locations/identity-normalization";
import type { ObservationItemInput } from "@/lib/observation/types";
import type { IdentityIssue, LocalProviderSurface } from "./contracts";
import { object, positiveInteger, text, website } from "./records";

function fragmentIdentifier(value: unknown): string | number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : text(value);
}
export function parseLocalItems(input: {
  items: readonly unknown[];
  surface: LocalProviderSurface;
  taskId: string;
  resultOrdinal: number;
  observedAt: string | null;
}) {
  const items: ObservationItemInput[] = [];
  const identityIssues: IdentityIssue[] = [];
  let unsupportedItemCount = 0;
  for (const [sourceOrdinal, raw] of input.items.entries()) {
    const row = object(raw);
    if (!row) {
      unsupportedItemCount += 1;
      continue;
    }
    const identifiers: Partial<Record<"cid" | "place_id", string>> = {};
    const localIssues: IdentityIssue[] = [];
    // Scan every native row before any type filter; never stop at a first match.
    for (const field of ["cid", "place_id"] as const) {
      if (row[field] === undefined || row[field] === null) continue;
      const parsed = opaqueBusinessIdentifier(row[field], field);
      if (parsed.ok) identifiers[field] = parsed.value;
      else
        localIssues.push({
          taskId: input.taskId,
          resultOrdinal: input.resultOrdinal,
          sourceOrdinal,
          field,
          reason: parsed.reason,
        });
    }
    identityIssues.push(...localIssues);
    const mapsOrganic = input.surface === "maps" && row.type === "maps_search";
    const mapsPaid = input.surface === "maps" && row.type === "maps_paid_item";
    const finder = input.surface === "local_finder" && row.type === "local_pack";
    if (!mapsOrganic && !mapsPaid && !finder) {
      unsupportedItemCount += 1;
      continue;
    }
    const promotion = mapsPaid
      ? "promoted"
      : mapsOrganic
        ? row.is_paid === true
          ? "unknown"
          : "organic"
        : row.is_paid === true
          ? "promoted"
          : row.is_paid === false
            ? "organic"
            : "unknown";
    const url = website(row.url);
    const fragment = {
      type: text(row.type),
      rank_group: positiveInteger(row.rank_group),
      rank_absolute: positiveInteger(row.rank_absolute),
      cid: fragmentIdentifier(row.cid),
      place_id: fragmentIdentifier(row.place_id),
      is_paid: typeof row.is_paid === "boolean" ? row.is_paid : null,
      resultOrdinal: input.resultOrdinal,
      sourceOrdinal,
      identityIssues: localIssues,
    };
    items.push({
      resultKind: input.surface === "maps" ? "map_listing" : "listing",
      // Finder rank_group includes ads of the same type: no invented organic scale.
      rankScale: mapsOrganic && promotion === "organic" ? "maps_organic" : null,
      promotion,
      sourcePage: null,
      sourceBlockId: null,
      sourceOrdinal,
      observedAt: input.observedAt === null ? null : new Date(input.observedAt),
      rankGroup: positiveInteger(row.rank_group),
      rankAbsolute: positiveInteger(row.rank_absolute),
      blockPosition: null,
      positionInBlock: null,
      title: text(row.title),
      businessName: text(row.title),
      url,
      domain: businessDomainCandidateKey(text(row.domain) ?? url),
      // Fields not documented for that item kind remain unknown.
      cid: mapsOrganic || finder ? (identifiers.cid ?? null) : null,
      placeId: mapsOrganic ? (identifiers.place_id ?? null) : null,
      mapsUrl: url ? normalizeGoogleMapsUrl(url) : null,
      rating: null,
      rawFragment: fragment,
    });
  }
  return { items, identityIssues, unsupportedItemCount };
}
