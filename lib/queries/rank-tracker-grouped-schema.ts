import { z } from "zod";

const facetValue = z.object({ count: z.coerce.number().int().nonnegative(), label: z.string() });
const member = z.object({
  id: z.string(),
  marketStatus: z.enum(["active", "paused", "removed"]),
  publicId: z.string(),
});

export const rankTrackerGroupedRawSelectionSchema = z.object({
  facets: z.object({
    intents: z.array(facetValue),
    positions: z.array(facetValue.extend({ id: z.enum(["top3", "top10", "11-50", "51-100"]) })),
    tags: z.array(facetValue),
    topics: z.array(facetValue),
  }),
  groups: z.array(z.object({ members: z.array(member), term: z.string() })),
  locations: z.array(
    z.object({
      count: z.coerce.number().int().nonnegative(),
      displayName: z.string(),
      id: z.string(),
      kind: z.enum(["country", "region", "city"]),
    }),
  ),
  matchedGroupCount: z.coerce.number().int().nonnegative(),
  matchedTargetCount: z.coerce.number().int().nonnegative(),
  totalCount: z.coerce.number().int().nonnegative(),
});

export type RankTrackerGroupedRawSelection = z.infer<typeof rankTrackerGroupedRawSelectionSchema>;
