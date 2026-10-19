import { z } from "zod";
import { pageQuery } from "./pagination";

/** Persisted rank-check statuses a list may filter by; the OpenAPI enum reads them too. */
export const rankCheckListStatuses = ["completed", "failed", "running"] as const;

export const rankCheckListQuerySchema = pageQuery.extend({
  since: z.string().optional(),
  status: z.enum(rankCheckListStatuses).optional(),
  until: z.string().optional(),
});

export type RankCheckListQuery = z.infer<typeof rankCheckListQuerySchema>;

/** Empty values count as absent, as they always have for these parameters. */
export function rankCheckListQuery(url: URL) {
  const value = (name: string) => url.searchParams.get(name) || undefined;
  return rankCheckListQuerySchema.parse({
    cursor: value("cursor"),
    limit: value("limit"),
    since: value("since"),
    status: value("status"),
    until: value("until"),
  });
}
