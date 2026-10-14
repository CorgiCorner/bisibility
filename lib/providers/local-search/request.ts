import { createPointRevision } from "@/lib/local-monitoring/geometry";
import {
  localOperatingSystems,
  MAPS_REQUEST_SCOPE,
} from "@/lib/local-monitoring/maps-request-scope";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { providerObservationTime } from "@/lib/observation/provider-metadata";
import { hasAsciiControlCharacters } from "@/lib/validation/control-characters";
import type { ProviderRequest } from "@usagekit/providers";
import type { LocalProviderBinding, LocalProviderSurface } from "./contracts";

export const DATAFORSEO_LOCAL_ORIGIN = "https://api.dataforseo.com";
export const PRODUCT_CUTOFF_LIMIT = MAPS_REQUEST_SCOPE.maxCutoff;
export function nativeTaskId(value: unknown): string | null {
  return typeof value === "string" &&
    /^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(value)
    ? value
    : null;
}
export function localSurface(binding: LocalProviderBinding): LocalProviderSurface {
  const { target } = binding;
  if (
    target.surface === "maps" &&
    target.resultKind === "map_listing" &&
    target.rankScale === "maps_organic"
  )
    return "maps";
  if (
    target.surface === "local_finder" &&
    target.resultKind === "listing" &&
    target.rankScale === "finder_organic"
  )
    return "local_finder";
  throw new Error("Unsupported local surface or rank scale");
}
export function validateLocalBinding(binding: LocalProviderBinding) {
  const { target, point, keyword } = binding;
  const surface = localSurface(binding);
  executionTargetKey(target);
  const canonical = createPointRevision({ revisionId: point.revisionId, ...point.coordinate });
  if (
    target.engine !== "google" ||
    target.pointRevision !== point.revisionKey ||
    point.revisionKey !== canonical.revisionKey ||
    point.contentHash !== canonical.contentHash ||
    point.coordinate.latitude !== canonical.coordinate.latitude ||
    point.coordinate.longitude !== canonical.coordinate.longitude ||
    point.precision !== canonical.precision ||
    point.geometryModel !== canonical.geometryModel ||
    point.version !== 1 ||
    target.keywordId !== keyword.id ||
    target.keywordRevision !== keyword.revision
  )
    throw new Error("Local request binding mismatch");
  if (
    !keyword.text.trim() ||
    hasAsciiControlCharacters(keyword.text) ||
    [...keyword.text].length > 700
  )
    throw new Error("Invalid local keyword");
  if (!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(target.language))
    throw new Error("Invalid local language code");
  if (
    !Number.isSafeInteger(target.cutoff) ||
    target.cutoff < 1 ||
    target.cutoff > PRODUCT_CUTOFF_LIMIT
  )
    throw new Error("Unsupported local cutoff");
  const range = surface === "maps" ? MAPS_REQUEST_SCOPE.zoomRange : [4, 18];
  if (
    target.zoom === null ||
    !Number.isSafeInteger(target.zoom) ||
    target.zoom < range[0] ||
    target.zoom > range[1]
  )
    throw new Error("Explicit supported zoom is required");
  const systems: readonly string[] = localOperatingSystems(target.device);
  if (target.operatingSystem === null || !systems.includes(target.operatingSystem))
    throw new Error("Explicit supported device and OS are required");
  if (binding.requestedAt !== null && !providerObservationTime(binding.requestedAt))
    throw new Error("Invalid local request time");
}

export function buildLocalTaskRequest(binding: LocalProviderBinding): ProviderRequest {
  validateLocalBinding(binding);
  const { target, point, keyword } = binding;
  // The provider decodes percent escapes and '+'. Preserve their literal meaning.
  const encodedKeyword = keyword.text.replaceAll("%", "%25").replaceAll("+", "%2B");
  if ([...encodedKeyword].length > 700)
    throw new Error("Encoded local keyword exceeds provider limit");
  return {
    method: "POST",
    url: `${DATAFORSEO_LOCAL_ORIGIN}/v3/serp/google/${localSurface(binding)}/task_post`,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      {
        keyword: encodedKeyword,
        location_coordinate: `${point.coordinate.latitude},${point.coordinate.longitude},${target.zoom}z`,
        language_code: target.language,
        device: target.device,
        os: target.operatingSystem,
        depth: target.cutoff,
        priority: 1,
      },
    ]),
  };
}
export function localTaskGetUrl(surface: LocalProviderSurface, taskId: string): string {
  if (!nativeTaskId(taskId) || (surface !== "maps" && surface !== "local_finder"))
    throw new Error("Invalid local retrieval reference");
  return `${DATAFORSEO_LOCAL_ORIGIN}/v3/serp/google/${surface}/task_get/advanced/${taskId}`;
}
