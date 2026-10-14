import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { providerObservationTime } from "@/lib/observation/provider-metadata";
import type { LocalObservationRunInput } from "@/lib/observation/types";
import type { LocalProviderBinding } from "./contracts";
import { parseLocalItems } from "./items";
import {
  MAPS_ADAPTER_VERSION,
  MAPS_CAPABILITY_VERSION,
  mapsTaskRequest,
  supportedMapsAdapterVersion,
} from "./maps-capability";
import { object } from "./records";
import { nativeTaskId } from "./request";

/** Only documented, correlated nonterminal GET replies may request another GET. */
export class MapsResultPendingError extends Error {
  constructor(readonly statusCode: 40601 | 40602) {
    super("The original Maps task is still pending.");
    this.name = "MapsResultPendingError";
  }
}

/** Task identity and returned fields correlate a response; they do not prove executed geography. */
export function parseMapsResult(
  data: unknown,
  taskId: string,
  binding: LocalProviderBinding,
  receivedAt: Date,
  adapterVersion = MAPS_ADAPTER_VERSION,
): LocalObservationRunInput {
  if (!supportedMapsAdapterVersion(adapterVersion))
    throw new Error("Unsupported Maps evidence version.");
  const request = mapsTaskRequest(binding);
  const body: unknown = JSON.parse(String(request.body));
  const expected = object(Array.isArray(body) ? body[0] : null);
  if (!expected || typeof expected.location_coordinate !== "string")
    throw new Error("Invalid original Maps request.");
  const root = object(data);
  const tasks = Array.isArray(root?.tasks) ? root.tasks : [];
  const task = object(tasks[0]);
  const echo = object(task?.data);
  const results = Array.isArray(task?.result) ? task.result : [];
  const result = object(results[0]);
  if (
    (task?.status_code === 40601 || task?.status_code === 40602) &&
    nativeTaskId(taskId) &&
    Number.isFinite(receivedAt.getTime()) &&
    root?.status_code === 20000 &&
    root.tasks_count === 1 &&
    tasks.length === 1 &&
    task.id === taskId &&
    task.result_count === 0 &&
    task.result === null &&
    JSON.stringify(task.path) ===
      JSON.stringify(["v3", "serp", "google", "maps", "task_get", "advanced", taskId]) &&
    (task.data == null ||
      (echo?.api === "serp" &&
        echo.se === "google" &&
        echo.se_type === "maps" &&
        (echo.keyword === expected.keyword || echo.keyword === binding.keyword.text) &&
        ["location_coordinate", "language_code", "device", "os", "depth"].every(
          (key) => echo[key] === expected[key],
        ) &&
        ["priority", "search_this_area", "search_places"].every(
          (key) => !Object.hasOwn(echo, key) || echo[key] === expected[key],
        )))
  )
    throw new MapsResultPendingError(task.status_code);
  if (
    !nativeTaskId(taskId) ||
    !Number.isFinite(receivedAt.getTime()) ||
    root?.status_code !== 20000 ||
    root.tasks_count !== 1 ||
    tasks.length !== 1 ||
    task?.id !== taskId ||
    task.status_code !== 20000 ||
    task.result_count !== 1 ||
    results.length !== 1 ||
    !result ||
    result.type !== "maps" ||
    JSON.stringify(task.path) !==
      JSON.stringify(["v3", "serp", "google", "maps", "task_get", "advanced", taskId])
  )
    throw new Error("Maps result does not match the original accepted task.");
  if (
    echo?.api !== "serp" ||
    echo.se !== "google" ||
    echo.se_type !== "maps" ||
    (echo.keyword !== expected.keyword && echo.keyword !== binding.keyword.text) ||
    ["location_coordinate", "language_code", "device", "os", "depth"].some(
      (key) => echo[key] !== expected[key],
    ) ||
    ["priority", "search_this_area", "search_places"].some(
      (key) => Object.hasOwn(echo, key) && echo[key] !== expected[key],
    ) ||
    result.keyword !== binding.keyword.text ||
    result.language_code !== binding.target.language ||
    result.spell != null
  )
    throw new Error("Maps response scope changed.");
  const items = Array.isArray(result.items)
    ? result.items
    : result.items === null && result.items_count === 0
      ? []
      : null;
  if (!items || items.length > 700 || result.items_count !== items.length)
    throw new Error("Maps result item count is incoherent.");
  const observedAt = providerObservationTime(result.datetime);
  const parsed = parseLocalItems({ items, surface: "maps", taskId, resultOrdinal: 0, observedAt });
  const { target, point } = binding;
  const v2 = adapterVersion === MAPS_ADAPTER_VERSION;
  const seedAcknowledged = v2 && echo.search_this_area === true && echo.search_places === false;
  const seedScope = {
    location: expected.location_coordinate,
    language: target.language,
    device: target.device,
    pointRevisionId: point.revisionId,
    coordinates: { ...point.coordinate },
    zoom: target.zoom,
    scopeClass: "coordinate_seed" as const,
  };
  return {
    provider: "dataforseo",
    surface: "maps",
    engine: "google",
    completeness: "unknown",
    configuredScope: {
      location: expected.location_coordinate,
      language: target.language,
      device: target.device,
      pointRevisionId: point.revisionId,
      coordinates: { ...point.coordinate },
      zoom: target.zoom,
      scopeClass: "coordinate_seed",
    },
    effectiveScope: seedAcknowledged ? seedScope : null,
    executedAt: new Date(receivedAt.getTime()),
    items: parsed.items,
    requestPolicy: {
      version: 1,
      surface: "maps",
      depth: target.cutoff,
      cutoff: target.cutoff,
      zoom: target.zoom,
      capabilityVersion: v2
        ? MAPS_CAPABILITY_VERSION
        : MAPS_CAPABILITY_VERSION.replace("maps-en-v2:", "maps-en-v1:"),
      pointRevisionId: point.revisionId,
      policyRevision: target.policyRevision,
      ...(v2
        ? {
            pointAcknowledgment: {
              version: 1 as const,
              class: "coordinate_seed" as const,
              known: seedAcknowledged,
              exactObserverPoint: false as const,
            },
            identityIssueCount: parsed.identityIssues.length,
            unsupportedItemCount: parsed.unsupportedItemCount,
          }
        : {}),
      evidence: {
        version: 1,
        adapterVersion,
        observedAt,
        observedThrough: observedAt,
        requestedAt: binding.requestedAt,
        targetRevision: executionTargetKey(target),
        policyRevision: target.policyRevision,
        completeThrough: { map_listing: null },
      },
    },
  };
}
