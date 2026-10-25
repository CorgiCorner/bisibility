import { projectionKeys } from "@/lib/provider-evidence/projection/model";
import { appPath } from "@/lib/routing/app-path";
import type { CheckRange, CheckRunFilter, CheckRunTriggerFilter } from "./contract";
import { parseExactCheckRange } from "./exact-range";

export type EvidenceRunsQuery = {
  range: CheckRange;
  status: CheckRunFilter;
  trigger: CheckRunTriggerFilter;
  from?: string;
  to?: string;
  cursor?: string;
  incidentId?: string;
};
export function parseEvidenceRunsQuery(search: URLSearchParams): EvidenceRunsQuery {
  const range = search.get("range"),
    status = search.get("status"),
    trigger = search.get("trigger");
  return {
    range: range === "24h" || range === "30d" ? range : "7d",
    status:
      status &&
      ["all", "completed", "failed", "running", "deferred", "fallback", ...projectionKeys].includes(
        status,
      )
        ? (status as CheckRunFilter)
        : "all",
    trigger:
      trigger && ["manual", "scheduled", "programmatic"].includes(trigger)
        ? (trigger as CheckRunTriggerFilter)
        : "all",
    ...(search.has("incidentId") ? { incidentId: search.get("incidentId")! } : {}),
    ...(search.has("cursor") ? { cursor: search.get("cursor")! } : {}),
    ...(search.has("from") ? { from: search.get("from")! } : {}),
    ...(search.has("to") ? { to: search.get("to")! } : {}),
  };
}
export function evidenceRunsPath(projectRef: string, query: Partial<EvidenceRunsQuery> = {}) {
  const search = new URLSearchParams({ view: "checks" });
  for (const [key, value] of Object.entries(query)) if (value !== undefined) search.set(key, value);
  return `${appPath(projectRef, "runs")}?${search}`;
}
export function validEvidenceRunsRange(query: EvidenceRunsQuery) {
  return parseExactCheckRange(query.from, query.to);
}
