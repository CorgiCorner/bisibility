import type { BusinessObservationItem } from "@/lib/business-locations/dto";
import { identifier, object } from "@/lib/providers/serp/web-local-proof";

type Row = Readonly<{
  id: string;
  resultKind: string;
  rawFragment: unknown;
  rankScale: string | null;
  sourceBlockId: string | null;
}>;
type Issue = NonNullable<BusinessObservationItem["identityIssue"]>;
/** Reinterpret only the exact retained raw fields used by the original Web adapters. */
function rawIssue(provider: string, item: Row): { issue: Issue | null } | null {
  const row = object(item.rawFragment);
  if (!row) return null;
  const dfs = provider === "dataforseo" && item.sourceBlockId?.startsWith("dataforseo:result:");
  const serp = provider === "serpapi" && item.sourceBlockId?.startsWith("serpapi:response:");
  if (!dfs && !serp) return null;
  const documented =
    serp && item.rankScale === "pack_slot" && item.sourceBlockId?.endsWith(":local_results.places");
  const values = dfs ? [row.cid, row.place_id] : [row.data_cid, row.place_id];
  if (
    values.some((value) => typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
  )
    return { issue: "unsafe_numeric_identifier" };
  const parsed = values.map(identifier);
  if (parsed.some((value) => value.invalid)) return { issue: "invalid_identifier" };
  if (
    documented &&
    parsed[0].value !== null &&
    parsed[1].value !== null &&
    parsed[0].value !== parsed[1].value
  )
    return { issue: "contradictory_identifiers" };
  return { issue: null };
}
/** Aggregate positive proof cannot identify a clean sibling unless every retained row reconciles. */
export function retainedWebIdentityIssues(provider: string, proof: unknown, rows: readonly Row[]) {
  const pack = rows.filter((row) => row.resultKind === "local_pack");
  const result = new Map<string, Issue>();
  const metadata = object(proof);
  const count = metadata?.identityIssues;
  const valid =
    metadata?.version === 1 &&
    typeof count === "number" &&
    Number.isSafeInteger(count) &&
    count >= 0;
  if (valid && count === 0) return result;
  const recovered = pack.map((row) => ({ row, recovered: rawIssue(provider, row) }));
  // Legacy observations had no aggregate. Preserve readable normalized evidence;
  // retain explicit raw anomalies where original adapter provenance is present.
  if (proof === undefined || proof === null) {
    for (const { row, recovered: value } of recovered)
      if (value?.issue) result.set(row.id, value.issue);
    return result;
  }
  if (
    !valid ||
    recovered.some(({ recovered: value }) => value === null) ||
    recovered.filter(({ recovered: value }) => value?.issue).length !== count
  ) {
    for (const row of pack) result.set(row.id, "invalid_identifier");
    return result;
  }
  for (const { row, recovered: value } of recovered)
    if (value?.issue) result.set(row.id, value.issue);
  return result;
}
