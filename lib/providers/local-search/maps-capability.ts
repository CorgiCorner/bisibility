import type { LocalCapability } from "@/lib/local-monitoring/capability";
import {
  FINDER_REQUEST_SCOPE,
  MAPS_REQUEST_SCOPE,
} from "@/lib/local-monitoring/maps-request-scope";
import { supportedLocalLanguage } from "@/lib/local-monitoring/search-languages";
import {
  FINDER_PRICE_VERSION,
  finderRequestOptions,
} from "@/lib/provider-rates/dataforseo-finder-module";
import {
  MAPS_PRICE_EXPIRES_AT,
  MAPS_PRICE_VERSION,
  mapsPriceCurrent,
  mapsRequestOptions,
} from "@/lib/provider-rates/dataforseo-maps-module";
import type { LocalProviderBinding } from "./contracts";
import { buildLocalTaskRequest, validateLocalBinding } from "./request";

export const MAPS_LEGACY_ADAPTER_VERSION = "dataforseo-maps-task-v1";
export const MAPS_V2_ADAPTER_VERSION = "dataforseo-maps-task-v2";
export const MAPS_ADAPTER_VERSION = "dataforseo-local-task-v3";
export function supportedMapsAdapterVersion(value: string) {
  return (
    value === MAPS_ADAPTER_VERSION ||
    value === MAPS_V2_ADAPTER_VERSION ||
    value === MAPS_LEGACY_ADAPTER_VERSION
  );
}
export const MAPS_CAPABILITY_VERSION = `dataforseo-local-languages-20260406-v3:${MAPS_PRICE_VERSION}:${FINDER_PRICE_VERSION}`;
function registeredCapability(
  expiresAt: string,
  adapterVersion = MAPS_ADAPTER_VERSION,
  finderAvailable = true,
): LocalCapability {
  return Object.freeze({
    version: MAPS_CAPABILITY_VERSION,
    provider: "dataforseo",
    adapterVersion,
    expiresAt,
    nativeBillingUnit: "cents",
    implementations: Object.freeze([
      ...(adapterVersion === MAPS_ADAPTER_VERSION
        ? [MAPS_REQUEST_SCOPE, ...(finderAvailable ? [FINDER_REQUEST_SCOPE] : [])]
        : [{ ...MAPS_REQUEST_SCOPE, languages: ["en"] }]
      ).map((scope) => ({
        evidenceVersion: adapterVersion,
        ...scope,
        point: true as const,
        asyncSubmitCollect: true as const,
      })),
    ]),
  });
}
export function mapsTaskRequest(binding: LocalProviderBinding) {
  validateLocalBinding(binding);
  if (
    !["maps", "local_finder"].includes(binding.target.surface) ||
    !supportedLocalLanguage(binding.target.language) ||
    (binding.target.surface === "local_finder" && binding.target.rankScale !== "finder_group")
  )
    throw new Error("Unsupported registered Maps scope.");
  const request = buildLocalTaskRequest(binding);
  const body: unknown = JSON.parse(String(request.body));
  if (!Array.isArray(body) || body.length !== 1)
    throw new Error("One Maps task per original item is required.");
  if (binding.target.surface === "maps")
    request.body = JSON.stringify([{ ...body[0], search_this_area: true, search_places: false }]);
  if (
    (binding.target.surface === "maps"
      ? mapsRequestOptions(request)
      : finderRequestOptions(request)
    ).pricingUnknown === "true"
  )
    throw new Error("Unsupported Maps request options.");
  return request;
}

export function mapsCapability(now: Date) {
  if (!mapsPriceCurrent(now))
    throw new Error("Maps pricing snapshot expired; review provider support and price.");
  return registeredCapability(
    new Date(Math.min(now.getTime() + 600_000, Date.parse(MAPS_PRICE_EXPIRES_AT))).toISOString(),
    MAPS_ADAPTER_VERSION,
    now >= new Date("2026-10-14T00:00:00.000Z"),
  );
}
/** Expiry blocks new work; it never blocks custody-verified collection of accepted tasks. */
export function mapsRetrievalCapability(adapterVersion = MAPS_ADAPTER_VERSION) {
  if (!supportedMapsAdapterVersion(adapterVersion))
    throw new Error("Unsupported original Maps adapter.");
  return registeredCapability("1970-01-01T00:00:00.000Z", adapterVersion);
}

export function acknowledgedLocalAdapter(value: string) {
  return value === MAPS_ADAPTER_VERSION || value === MAPS_V2_ADAPTER_VERSION;
}
