import type { RetainedSubmission } from "@/lib/provider-evidence/recovery/submission";
import { ORGANIC_LIVE_PATH, ORGANIC_POST_PATH } from "./capabilities";
import type { HistoryTask } from "./history";
import { record } from "./outcomes";

export type { RetainedSubmission } from "@/lib/provider-evidence/recovery/submission";

const FIELDS = [
  "keyword",
  "location_code",
  "location_name",
  "language_code",
  "language_name",
  "device",
  "depth",
  "priority",
  "search_param",
  "find_targets_in",
  "stop_crawl_on_match",
] as const;

function hasCanonicalPayload(retained: RetainedSubmission) {
  const payload = retained.payload;
  if (retained.endpointPath === ORGANIC_LIVE_PATH && Object.hasOwn(payload, "priority"))
    return false;
  const fields = ["keyword", "device", "depth", "search_param"];
  if (retained.endpointPath === ORGANIC_POST_PATH) fields.push("priority");
  return (
    fields.every(
      (key) => Object.hasOwn(payload, key) && payload[key] !== undefined && payload[key] !== null,
    ) &&
    (typeof payload.language_code === "string" || typeof payload.language_name === "string") &&
    (typeof payload.location_code === "number" || typeof payload.location_name === "string")
  );
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  const object = record(value);
  return object
    ? Object.fromEntries(
        Object.keys(object)
          .sort()
          .map((key) => [key, canonical(object[key])]),
      )
    : value;
}

const METADATA_ROUTING_KEYS = ["api", "se", "se_type", "function"] as const;

function sameRouting(endpointPath: string, metadata: Record<string, unknown>) {
  const parts = endpointPath.split("/").slice(2);
  return METADATA_ROUTING_KEYS.every(
    (key, index) => !Object.hasOwn(metadata, key) || metadata[key] === parts[index],
  );
}

function documentedDefaults(payload: Record<string, unknown>) {
  if (Object.hasOwn(payload, "os")) return payload;
  // Organic live and task-post documentation specify these defaults for an omitted OS.
  const os =
    payload.device === "desktop" ? "windows" : payload.device === "mobile" ? "android" : null;
  return os ? { ...payload, os } : payload;
}

function samePayload(original: Record<string, unknown>, returned: Record<string, unknown>) {
  const retained = documentedDefaults(original);
  const candidate = documentedDefaults(returned);
  const candidateFields = Object.keys(candidate).filter(
    (key) => !METADATA_ROUTING_KEYS.some((routing) => routing === key),
  );
  const keys = new Set([...FIELDS, ...Object.keys(retained), ...candidateFields]);
  return [...keys].every(
    (key) =>
      Object.hasOwn(retained, key) === Object.hasOwn(candidate, key) &&
      JSON.stringify(canonical(retained[key])) === JSON.stringify(canonical(candidate[key])),
  );
}

export function matchHistoryTask(
  tag: string,
  retained: RetainedSubmission | null,
  candidates: readonly HistoryTask[],
):
  | { kind: "match"; task: HistoryTask }
  | { kind: "no_match" | "ambiguous" | "missing_retained_payload" } {
  if (!retained?.endpointPath || !hasCanonicalPayload(retained) || retained.payload.tag !== tag) {
    return { kind: "missing_retained_payload" };
  }
  if (!tag) return { kind: "no_match" };
  const tagged = candidates.filter((candidate) => candidate.tag === tag);
  if (tagged.length > 1) return { kind: "ambiguous" };
  const task = tagged[0];
  return task?.metadata &&
    task.endpointPath === retained.endpointPath &&
    sameRouting(retained.endpointPath, task.metadata) &&
    samePayload(retained.payload, task.metadata)
    ? { kind: "match", task }
    : { kind: "no_match" };
}
