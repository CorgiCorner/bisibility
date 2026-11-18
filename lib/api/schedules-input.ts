import { z } from "zod";
import { ApiInputError } from "./errors";
import { pageQuery } from "./pagination";
import { isPublicScheduleId } from "./schedule-public-id";

export const scheduleKinds = [
  "rank",
  "local_monitor",
  "ai",
  "domain_rating",
  "search_console_import",
  "page_indexing",
  "sitemap_fetch",
] as const;
export const scheduleStates = ["active", "paused", "archived"] as const;
export const scheduleListQuerySchema = pageQuery.extend({
  kind: z.enum(scheduleKinds).optional(),
  state: z.enum(scheduleStates).optional(),
});

/** Native sch_, ais_ and lmn_ IDs, plus derived dsy_ data-sync IDs. The sync: form stays internal. */
export function isSchedulePublicId(value: string) {
  return isPublicScheduleId(value);
}

export function requireSchedulePublicId(value: string) {
  if (!isSchedulePublicId(value))
    throw new ApiInputError("Expected a public schedule ID.", "invalid_public_id");
  return value;
}
