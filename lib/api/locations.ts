import "server-only";

import { z } from "zod";
import { searchLocations } from "./locations-search";
import { listResponse } from "./responses";

type LocationApiContext = {
  headers: Headers;
  url: URL;
};

const querySchema = z.object({
  country: z.string().trim().min(1).max(120).nullable(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  query: z.string().trim().min(2).max(120),
});

export async function searchApiLocations(ctx: LocationApiContext) {
  const input = querySchema.parse({
    country: ctx.url.searchParams.get("country"),
    limit: ctx.url.searchParams.get("limit") ?? undefined,
    query: ctx.url.searchParams.get("q") ?? "",
  });
  const { candidates } = await searchLocations(input);
  return listResponse(
    candidates.map((candidate) => ({
      city_name: candidate.city_name,
      country_code: candidate.country_code,
      display_name: candidate.display_name,
      hl: candidate.hl,
      kind: candidate.kind,
      language_label: candidate.language_label,
      location_key: candidate.canonical_key,
      region_code: candidate.region_code,
      region_name: candidate.region_name,
    })),
    null,
    { headers: ctx.headers },
  );
}
