import type { AddKeywordsRowInput } from "@/lib/schemas/keyword";
import type { ResolveKeywordLocationInput } from "@/lib/serp/location-service";
import { resolveKeywordLocation } from "@/lib/serp/location-service";

type KeywordLocationActionInput = {
  city?: string | null;
  location: string;
  locationKey?: string | null;
  projectId: string;
};

export function keywordLocationResolverInput(
  input: KeywordLocationActionInput,
): ResolveKeywordLocationInput {
  if (input.locationKey) {
    return {
      projectId: input.projectId,
      selection: { canonicalKey: input.locationKey, kind: "city" },
    };
  }

  return {
    city: input.city,
    country: input.location,
    projectId: input.projectId,
  };
}

type ResolvedKeywordRow = {
  resolved: Awaited<ReturnType<typeof resolveKeywordLocation>>;
  row: AddKeywordsRowInput;
};

function keywordRowLocationKey(row: AddKeywordsRowInput) {
  return row.locationKey ?? `${row.location}\u0000${row.city ?? ""}`;
}

export function uniqueLocationWarnings(rows: readonly ResolvedKeywordRow[]) {
  return [
    ...new Set(rows.flatMap((item) => (item.resolved.warning ? [item.resolved.warning] : []))),
  ];
}

export async function resolveKeywordRows(rows: readonly AddKeywordsRowInput[], projectId: string) {
  const locations = new Map<string, Awaited<ReturnType<typeof resolveKeywordLocation>>>();
  const resolvedRows: ResolvedKeywordRow[] = [];
  for (const row of rows) {
    const key = keywordRowLocationKey(row);
    let resolved = locations.get(key);
    if (!resolved) {
      resolved = await resolveKeywordLocation(
        keywordLocationResolverInput({
          city: row.city,
          location: row.location,
          locationKey: row.locationKey,
          projectId,
        }),
      );
      locations.set(key, resolved);
    }
    resolvedRows.push({ resolved, row });
  }
  return resolvedRows;
}
